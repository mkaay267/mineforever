const axios = require("axios");

async function bibleCommand(sock, chatId, message, userMessage) {
    try {
        const reference = userMessage.slice(6).trim(); // Remove '.bible ' from command

        if (!reference) {
            await sock.sendMessage(chatId, {
                text: `⚠️ *Please provide a Bible reference.*\n\n📝 *Example:*\n.bible John 1:1`
            }, { quoted: message });
            return;
        }

        const apiUrl = `https://bible-api.com/${encodeURIComponent(reference)}`;
        const response = await axios.get(apiUrl);

        if (response.status === 200 && response.data.text) {
            const { reference: ref, text, translation_name } = response.data;

            await sock.sendMessage(chatId, {
                text: `📜 *Bible Verse Found!*\n\n` +
                    `📖 *Reference:* ${ref}\n` +
                    `📚 *Text:* ${text}\n\n` +
                    `🗂️ *Translation:* ${translation_name}\n\n© MOON XMD BIBLE`
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: "❌ *Verse not found.* Please check the reference and try again."
            }, { quoted: message });
        }
    } catch (error) {
        console.error(error);
        await sock.sendMessage(chatId, {
            text: "⚠️ *An error occurred while fetching the Bible verse.* Please try again."
        }, { quoted: message });
    }
}

module.exports = bibleCommand;