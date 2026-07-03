const {
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const db = require('../components/database');
const logging = require('../components/logging');
const rateLimiter = require('../components/rateLimiter');
const queue = require('../components/queue');
const theme = require('../components/theme');
const config = require('../config.json'); // Import the config.json file

// Tracks open tickets so the close handler can find their metadata without
// registering a new global listener per ticket. Keyed by channel id.
const activeTickets = new Map();

// Promise wrapper around the callback-based db helper so it plays nicely with
// the async ticket-creation flow.
function getTicketCount(userId) {
    return new Promise((resolve, reject) => {
        db.getTicketCount(userId, (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.ticket_count : 0);
        });
    });
}

function buildSupportModal() {
    return new ModalBuilder()
        .setCustomId('support_ticket_modal')
        .setTitle('Support Ticket')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('script_name')
                    .setLabel('Script Name')
                    .setPlaceholder('e.g. gm_inventory')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('script_version')
                    .setLabel('Script Version')
                    .setPlaceholder('e.g. 1.4.2')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('jo_libs_version')
                    .setLabel('jo_libs Version')
                    .setPlaceholder('e.g. 1.2.0')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            )
        );
}

// Creates the ticket channel, posts the intro embed, wires up logging and
// tracks the ticket. `details` holds the support-modal fields (if any).
async function createTicket(interaction, client, ticketType, details = {}) {
    const member = interaction.member;
    const guild = interaction.guild;

    await interaction.deferReply({ ephemeral: true });

    let ticketCount;
    try {
        ticketCount = await getTicketCount(member.id);
    } catch (err) {
        console.error(err.message);
        return interaction.editReply({ content: 'An error occurred while checking your tickets.' });
    }

    if (ticketCount > 0) {
        return interaction.editReply({ content: 'You can only have one active ticket at a time.' });
    }

    const categoryId = ticketType === 'support_ticket' ? config.categories.support : config.categories.sales;
    const channelName = `${ticketType}-${member.user.username}`;

    const permissionOverwrites = [
        {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel],
        },
        {
            id: member.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
    ];

    // Add support roles specified in config.supportRoleIds to have access to the channel
    config.supportRoleIds.forEach(roleId => {
        permissionOverwrites.push({
            id: roleId.trim(),
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    });

    const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: member.id, // store owner id so close handling survives a restart
        permissionOverwrites: permissionOverwrites,
    });

    // Update ticket count in the database
    db.incrementTicketCount(member.id);

    const logFilePath = `./logs/${channelName}.txt`;
    const collector = ticketChannel.createMessageCollector({ filter: m => !m.author.bot });

    activeTickets.set(ticketChannel.id, {
        ownerId: member.id,
        ticketType,
        logFilePath,
        username: member.user.username,
        collector,
    });

    // Build the log header, including the support details when present
    let logHeader = `Ticket Type: ${ticketType.replace('_', ' ')}\nCreated by: ${member.user.tag}\n`;
    if (details.scriptName) {
        logHeader += `Script Name: ${details.scriptName}\n`;
        logHeader += `Script Version: ${details.scriptVersion}\n`;
        logHeader += `jo_libs Version: ${details.joLibsVersion}\n`;
    }
    logHeader += '\n';
    queue.addToQueue(() => logging.appendToLog(logFilePath, logHeader));

    // Log messages in the ticket channel incrementally
    collector.on('collect', message => {
        const logMessage = `${message.author.tag}: ${message.content}\n`;
        queue.addToQueue(() => logging.appendToLog(logFilePath, logMessage));
    });

    // Send the intro message with a close button
    const isSupport = ticketType === 'support_ticket';
    const embed = theme.baseEmbed()
        .setColor(isSupport ? theme.COLORS.support : theme.COLORS.sales)
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle(`${isSupport ? theme.EMOJIS.support : theme.EMOJIS.sales} ${isSupport ? 'Support' : 'Sales'} Ticket`)
        .setDescription(
            `${theme.EMOJIS.wave} Hello ${member}, thanks for reaching out!\n` +
            'Our team has been notified and will be with you shortly. ' +
            'Please describe your request in as much detail as you can.\n\n' +
            `When you're done, press **Close Ticket** below.`
        )
        .setThumbnail(member.user.displayAvatarURL());

    if (details.scriptName) {
        embed.addFields(
            { name: `${theme.EMOJIS.script} Script Name`, value: details.scriptName, inline: true },
            { name: `${theme.EMOJIS.tag} Script Version`, value: details.scriptVersion, inline: true },
            { name: `${theme.EMOJIS.lib} jo_libs Version`, value: details.joLibsVersion, inline: true }
        );
    }

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setEmoji(theme.EMOJIS.lock)
            .setStyle(ButtonStyle.Danger)
    );

    // Ping the configured role(s) for this ticket type so the team is notified
    const pingRoleIds = ((config.pingRoleIds && config.pingRoleIds[isSupport ? 'support' : 'sales']) || [])
        .map(id => id.trim())
        .filter(Boolean);
    const roleMentions = pingRoleIds.map(id => `<@&${id}>`).join(' ');
    const content = [roleMentions, `${member.user}`].filter(Boolean).join(' ');

    await ticketChannel.send({
        content,
        embeds: [embed],
        components: [actionRow],
        allowedMentions: { users: [member.id], roles: pingRoleIds },
    });

    const createdEmbed = theme.baseEmbed()
        .setColor(isSupport ? theme.COLORS.support : theme.COLORS.sales)
        .setDescription(`${theme.EMOJIS.ticket} Your ${isSupport ? 'support' : 'sales'} ticket has been created: ${ticketChannel}`);

    await interaction.editReply({ embeds: [createdEmbed] });
}

// Closes the ticket the interaction was triggered in.
async function closeTicket(interaction, client) {
    const channel = interaction.channel;
    const info = activeTickets.get(channel.id);

    // Fall back to channel metadata if the ticket isn't tracked in memory
    // (e.g. it was created before the last restart).
    const ownerId = info ? info.ownerId : channel.topic;
    const ticketType = info ? info.ticketType : (channel.name.startsWith('support') ? 'support_ticket' : 'sales_ticket');
    const logFilePath = info ? info.logFilePath : `./logs/${channel.name}.txt`;
    const username = info ? info.username : channel.name.split('-').slice(1).join('-');

    await interaction.reply({ content: 'Ticket closed!', ephemeral: true });

    if (info && info.collector) info.collector.stop();

    const closeMessage = `\nTicket closed by ${interaction.member.user.tag} at ${new Date().toLocaleString()}\n`;
    queue.addToQueue(() => logging.appendToLog(logFilePath, closeMessage));

    // Upload the log file to the specified channel and delete it afterward
    queue.addToQueue(() => logging.uploadAndDeleteLog(logFilePath, client.channels.cache.get(config.logChannelId), username, ticketType));

    // Reset ticket count in the database
    if (ownerId) db.resetTicketCount(ownerId);

    activeTickets.delete(channel.id);

    const closingEmbed = theme.baseEmbed()
        .setColor(theme.COLORS.danger)
        .setTitle(`${theme.EMOJIS.lock} Ticket Closing`)
        .setDescription(`Closed by ${interaction.member}. This channel will be deleted in **5 seconds**.`);

    await channel.send({ embeds: [closingEmbed] });
    setTimeout(() => {
        channel.delete().catch(err => console.error('Error deleting ticket channel:', err.message));
    }, 5000);
}

async function handleInteraction(interaction, client) {
    // Support ticket modal submission -> create the ticket with the collected details
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'support_ticket_modal') {
            const details = {
                scriptName: interaction.fields.getTextInputValue('script_name'),
                scriptVersion: interaction.fields.getTextInputValue('script_version'),
                joLibsVersion: interaction.fields.getTextInputValue('jo_libs_version'),
            };
            return createTicket(interaction, client, 'support_ticket', details);
        }
        return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const userId = interaction.user.id;

    // Rate limiting
    if (rateLimiter.isRateLimited(userId)) {
        return interaction.reply({ content: 'You are sending too many requests. Please slow down.', ephemeral: true });
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'create_ticket') {
            // Show the dropdown menu when "Create Ticket" button is clicked
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_type')
                .setPlaceholder('Select a ticket type...')
                .addOptions(
                    {
                        label: 'Support Ticket',
                        description: 'Bugs, errors or questions about our scripts',
                        value: 'support_ticket',
                        emoji: theme.EMOJIS.support,
                    },
                    {
                        label: 'Sales Ticket',
                        description: 'Pre-purchase questions and enquiries',
                        value: 'sales_ticket',
                        emoji: theme.EMOJIS.sales,
                    }
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const promptEmbed = theme.baseEmbed()
                .setColor(theme.COLORS.brand)
                .setTitle(`${theme.EMOJIS.ticket} Create a Ticket`)
                .setDescription('Choose the type of ticket you\'d like to open from the menu below.');

            return interaction.reply({ embeds: [promptEmbed], components: [row], ephemeral: true });
        }

        if (interaction.customId === 'close_ticket') {
            return closeTicket(interaction, client);
        }

        return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
        const ticketType = interaction.values[0]; // Get the selected ticket type

        // Support tickets collect extra info through a modal before creation
        if (ticketType === 'support_ticket') {
            let ticketCount;
            try {
                ticketCount = await getTicketCount(userId);
            } catch (err) {
                console.error(err.message);
                return interaction.reply({ content: 'An error occurred while checking your tickets.', ephemeral: true });
            }

            if (ticketCount > 0) {
                return interaction.reply({ content: 'You can only have one active ticket at a time.', ephemeral: true });
            }

            return interaction.showModal(buildSupportModal());
        }

        // Sales tickets are created directly
        return createTicket(interaction, client, ticketType);
    }
}

module.exports = {
    handleInteraction,
};
