const settings = require("../settings");
const { Vcard } = require('../lib/Keith');
const { getUptime, getDetailedUptime, getLongUptime } = require('../lib/runtime');



function getPushname(message) {
    return message.pushName || message.key.participant?.split('@')[0] || 'No Name';
}

async function aliveCommand(sock, chatId, message) {
    try {
    
    const uptime = getUptime();
    const pushname = getPushname(message);
    
    await sock.sendMessage(chatId, {
            react: { text: '❄', key: message.key }
        });
        const alive = `
\n     ☆ \`${settings.botName}\` ☆

 *ʜɪ 👋* @${pushname}

 *🔋 uᴘᴛɪᴍᴇ: ${uptime}*
 
 *⚡ vᴇʀꜱɪᴏɴ:* 1.0.0

 \`sᴛᴀᴛᴜꜱ\`: *MOON-XMD is online! 🚀*


🔗 https://github.com/mrkeithtech/Moon-Xmd

> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴍᴏᴏɴ xᴍᴅ`;

        
      await sock.sendMessage(chatId, { text: alive},{ quoted: Vcard });
      
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: '🌙 MOON XMD is alive and running!' }, { quoted: message });
    }
}

module.exports = aliveCommand;