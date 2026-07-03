const { welcomeChannelId, welcomeMessages, welcomeCard = {} } = require('../config.json');
const theme = require('../components/theme');

// Replaces every ${member} placeholder with the member mention.
function fillPlaceholders(text, member) {
    return text.split('${member}').join(`<@${member.id}>`);
}

async function WelcomeNewMember(client, member) {
    try {
        const channel = await client.channels.fetch(welcomeChannelId);
        if (!channel) {
            console.error('Welcome channel not found.');
            return;
        }

        const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        const tagline = fillPlaceholders(randomMessage, member);

        const guildName = member.guild ? member.guild.name : 'the server';
        const title = `${theme.EMOJIS.party} ${welcomeCard.title || `Welcome to ${guildName}!`}`;

        let description = tagline;
        if (welcomeCard.description) {
            description += `\n\n${fillPlaceholders(welcomeCard.description, member)}`;
        }

        const footerText = welcomeCard.footer || `Welcome to ${guildName}`;

        const embed = theme.baseEmbed()
            .setColor(theme.COLORS.welcome)
            .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
            .setTitle(title)
            .setDescription(description)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: footerText });

        // Member count ("You're our Nth member")
        if (welcomeCard.showMemberCount !== false && member.guild) {
            embed.addFields({
                name: `${theme.EMOJIS.members} Member Count`,
                value: `You're member **#${member.guild.memberCount}**!`,
                inline: true,
            });
        }

        // Account age via a Discord relative timestamp
        if (welcomeCard.showAccountAge !== false) {
            const createdUnix = Math.floor(member.user.createdTimestamp / 1000);
            embed.addFields({
                name: `${theme.EMOJIS.calendar} Account Created`,
                value: `<t:${createdUnix}:R>`,
                inline: true,
            });
        }

        // Small delay so Discord finishes provisioning the member before we ping.
        setTimeout(() => {
            channel.send({
                embeds: [embed],
                allowedMentions: { users: [] },
            })
                .then(() => console.log(`Welcome message sent for ${member.user.tag}`))
                .catch(err => console.error('Error sending welcome message:', err));
        }, 1000);
    } catch (error) {
        console.error('Failed to send welcome message:', error);
    }
}

module.exports = { WelcomeNewMember };
