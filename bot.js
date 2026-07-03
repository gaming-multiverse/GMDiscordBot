const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType  } = require('discord.js');
const interactionHandler = require('./handlers/interactionHandler');
const WelcomeNewMember = require('./handlers/welcomeHandler');
const db = require('./components/database');
const theme = require('./components/theme');
const config = require('./config.json');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
});

// Posts the ticket panel (embed + "Create Ticket" button) and records its
// message id so we can tell later whether it still exists.
async function postTicketPanel(ticketChannel) {
    const embed = theme.baseEmbed()
        .setColor(theme.COLORS.brand)
        .setTitle(`${theme.EMOJIS.ticket} Support Tickets`)
        .setDescription(
            'Need a hand or want to get in touch? Open a ticket and our team will be with you as soon as possible.\n\n' +
            `${theme.EMOJIS.support} **Support** - bugs, errors or questions about our scripts.\n` +
            `${theme.EMOJIS.sales} **Sales** - pre-purchase questions and enquiries.\n\n` +
            'Press the button below to get started.'
        )
        .setThumbnail(client.user.displayAvatarURL());

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setEmoji(theme.EMOJIS.ticket)
                .setStyle(ButtonStyle.Primary),
        );

    const message = await ticketChannel.send({ embeds: [embed], components: [actionRow] });
    db.setEmbedStatus(ticketChannel.id, message.id);
    console.log('Ticket panel posted and status saved in the database.');
}

// Ensures the ticket panel exists in the configured channel. Unlike a plain
// "created before?" flag, this verifies the recorded message is still present
// so a manually deleted panel gets reposted.
async function ensureTicketPanel() {
    const ticketChannelId = config.ticketChannelId;

    db.getEmbedStatus(ticketChannelId, async (err, row) => {
        if (err) {
            console.error('Error checking embed status:', err.message);
            return;
        }

        const ticketChannel = client.channels.cache.get(ticketChannelId);
        if (!ticketChannel) {
            console.error('Ticket channel not found.');
            return;
        }

        // If we have a recorded panel message, confirm it still exists before
        // deciding to skip. fetch() rejects when the message was deleted.
        if (row && row.embed_created && row.message_id) {
            try {
                await ticketChannel.messages.fetch(row.message_id);
                console.log('Ticket panel already present, skipping creation.');
                return;
            } catch (fetchErr) {
                console.log('Recorded ticket panel is missing, reposting.');
            }
        }

        try {
            await postTicketPanel(ticketChannel);
        } catch (postErr) {
            console.error('Error posting ticket panel:', postErr.message);
        }
    });
}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    client.user.setActivity('the cfx community', {
        type: ActivityType.Competing
    });

    client.user.setStatus('dnd');

    ensureTicketPanel();
});

// Repost the panel immediately if it's deleted while the bot is running.
client.on('messageDelete', async (message) => {
    if (message.channelId !== config.ticketChannelId) return;

    db.getEmbedStatus(config.ticketChannelId, async (err, row) => {
        if (err || !row || row.message_id !== message.id) return;

        const ticketChannel = client.channels.cache.get(config.ticketChannelId);
        if (!ticketChannel) return;

        try {
            await postTicketPanel(ticketChannel);
        } catch (postErr) {
            console.error('Error reposting ticket panel:', postErr.message);
        }
    });
});

client.on('guildMemberAdd', async (member) => {
    await WelcomeNewMember.WelcomeNewMember(client, member);
});


client.on('interactionCreate', async interaction => {
    await interactionHandler.handleInteraction(interaction, client);
});

client.login(process.env.DISCORD_TOKEN);
