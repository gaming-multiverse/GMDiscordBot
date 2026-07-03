const { EmbedBuilder } = require('discord.js');

// Central place to tweak the look of the ticket system.
const COLORS = {
    brand: 0x5865f2, // blurple  – panels / neutral
    support: 0x3ba55d, // green    – support tickets
    sales: 0xfaa61a, // gold     – sales tickets
    danger: 0xed4245, // red      – closing / warnings
    welcome: 0x57f287, // bright green – member welcomes
};

const EMOJIS = {
    ticket: '🎫',
    support: '🛠️',
    sales: '💼',
    lock: '🔒',
    script: '📜',
    tag: '🏷️',
    lib: '📚',
    user: '👤',
    wave: '👋',
    party: '🎉',
    sparkles: '✨',
    members: '👥',
    calendar: '📅',
};

const FOOTER_TEXT = 'GM Support System';

// Base embed with the shared footer + timestamp so every embed feels consistent.
function baseEmbed() {
    return new EmbedBuilder().setFooter({ text: FOOTER_TEXT }).setTimestamp();
}

module.exports = {
    COLORS,
    EMOJIS,
    FOOTER_TEXT,
    baseEmbed,
};
