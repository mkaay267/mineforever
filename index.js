/*
 CODE BY KEITH TECH
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { File } = require('megajs')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log(chalk.yellow('⚠️  RAM too high (>400MB), restarting bot...'))
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let phoneNumber = `${settings.OwnerNumber}`
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "MOON XMD"
const prefix = `${settings.Prefix}`
global.themeemoji = ""
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Session directory setup
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}

// SESSION ID FUNCTIONS
async function downloadSessionData() {
    try {
        await fs.promises.mkdir(sessionDir, { recursive: true });

        if (!fs.existsSync(credsPath)) {
            if (!settings.SESSION_ID) {
                console.log(chalk.yellow('⚠️  Session ID not found in settings!'));
                console.log(chalk.yellow('⚠️  Creds.json not found in session folder!'));
                console.log(chalk.cyan('📱 Will use pairing code method instead...'));
                return false;
            }

            console.log(chalk.cyan('📥 Downloading session data from SESSION_ID...'));
            console.log(chalk.cyan('🔰 Downloading MEGA.nz session...'));
            
            // Remove "Moon~" prefix if present, otherwise use full SESSION_ID
            const megaFileId = settings.SESSION_ID.startsWith('Moon~') 
                ? settings.SESSION_ID.replace("Moon~", "") 
                : settings.SESSION_ID;

            try {
                const filer = File.fromURL(`https://mega.nz/file/${megaFileId}`);
                
                const sessionData = await new Promise((resolve, reject) => {
                    filer.download((err, data) => {
                        if (err) reject(err);
                        else resolve(data);
                    });
                });
                
                await fs.promises.writeFile(credsPath, sessionData);
                console.log(chalk.green('✅ MEGA session downloaded successfully!'));
                return true;
            } catch (megaError) {
                console.log(chalk.red('❌ Error downloading from MEGA:'), megaError.message);
                console.log(chalk.yellow('⚠️  Invalid MEGA file ID or file not accessible'));
                return false;
            }
        } else {
            console.log(chalk.green('✅ Using existing creds.json'));
            return true;
        }
    } catch (error) {
        console.error(chalk.red('❌ Error processing session data:'), error.message);
        return false;
    }
}

async function startXeonBotInc() {
    try {
        console.log(chalk.cyan('╔════════════════════════════════╗'));
        console.log(chalk.cyan('║                                        ║'));
        console.log(chalk.cyan('║     🌙 Connecting to Moon Xmd...      ║'));
        console.log(chalk.cyan('║                                        ║'));
        console.log(chalk.cyan('╚════════════════════════════════╝'));
        console.log('');

        // Try to download session data first
        const sessionDownloaded = await downloadSessionData();

        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            retryRequestDelayMs: 10000,
            transactionOpts: { maxCommitRetries: 10, delayBetweenTriesMs: 3000 },
            maxMsgRetryCount: 15,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            emitOwnEvents: true,
            fireInitQueries: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: true,
            markOnlineOnConnect: true,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

        store.bind(XeonBotInc.ev)

        // Message handling
        XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
            try {
                const mek = chatUpdate.messages[0]
                if (!mek.message) return
                mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
                if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                    await handleStatus(XeonBotInc, chatUpdate);
                    return;
                }
                if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                    const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                    if (!isGroup) return
                }
                if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

                if (XeonBotInc?.msgRetryCounterCache) {
                    XeonBotInc.msgRetryCounterCache.clear()
                }

                try {
                    await handleMessages(XeonBotInc, chatUpdate, true)
                } catch (err) {
                    console.error("Error in handleMessages:", err)
                    if (mek.key && mek.key.remoteJid) {
                        await XeonBotInc.sendMessage(mek.key.remoteJid, {
                            text: '❌ An error occurred while processing your message.',
                            contextInfo: {
                                forwardingScore: 1,
                                isForwarded: true,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: '120363417440480101@newsletter',
                                    newsletterName: 'MOON XMD',
                                    serverMessageId: -1
                                }
                            }
                        }).catch(console.error);
                    }
                }
            } catch (err) {
                console.error("Error in messages.upsert:", err)
            }
        })

        XeonBotInc.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            } else return jid
        }

        XeonBotInc.ev.on('contacts.update', update => {
            for (let contact of update) {
                let id = XeonBotInc.decodeJid(contact.id)
                if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
            }
        })

        XeonBotInc.getName = (jid, withoutContact = false) => {
            id = XeonBotInc.decodeJid(jid)
            withoutContact = XeonBotInc.withoutContact || withoutContact
            let v
            if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
                v = store.contacts[id] || {}
                if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
                resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
            })
            else v = id === '0@s.whatsapp.net' ? {
                id,
                name: 'WhatsApp'
            } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
                XeonBotInc.user :
                (store.contacts[id] || {})
            return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
        }

        XeonBotInc.public = true
        XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

        // Handle pairing code - only if no session exists
        if (pairingCode && !XeonBotInc.authState.creds.registered) {
            if (useMobile) throw new Error('Cannot use pairing code with mobile api')

            let phoneNumber
            if (!!global.phoneNumber) {
                phoneNumber = global.phoneNumber
            } else {
                phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Please type your WhatsApp number\nFormat: 263xx (without + or spaces) : `)))
            }

            phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

            const pn = require('awesome-phonenumber');
            if (!pn('+' + phoneNumber).isValid()) {
                console.log(chalk.red('❌ Invalid phone number format!'));
                process.exit(1);
            }

            setTimeout(async () => {
                try {
                    let code = await XeonBotInc.requestPairingCode(phoneNumber)
                    code = code?.match(/.{1,4}/g)?.join("-") || code
                    
                    console.log('');
                    console.log(chalk.cyan('╔════════════════════════════════╗'));
                    console.log(chalk.cyan('║                                        ║'));
                    console.log(chalk.cyan('║       PAIRING CODE SYSTEM              ║'));
                    console.log(chalk.cyan('║                                        ║'));
                    console.log(chalk.cyan('╚════════════════════════════════╝'));
                    console.log('');
                    console.log(chalk.greenBright('  Your Pairing Code: ') + chalk.white.bold(code));
                    console.log('');
                    console.log(chalk.yellow('  📱 Enter this code in WhatsApp:'));
                    console.log(chalk.yellow('     1. Open WhatsApp'));
                    console.log(chalk.yellow('     2. Settings > Linked Devices'));
                    console.log(chalk.yellow('     3. Link a Device'));
                    console.log(chalk.yellow('     4. Enter the code above'));
                    console.log('');
                } catch (error) {
                    console.error(chalk.red('❌ Error requesting pairing code:'), error.message)
                }
            }, 3000)
        }

        // Connection handling with better reconnection logic
        XeonBotInc.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect, qr } = s
            
            if (connection === 'close') {
                const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
                
                if (reason === DisconnectReason.badSession) {
                    console.log(chalk.red('❌ Bad Session File, Please Delete Session and Scan Again'));
                    process.exit(0);
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log(chalk.yellow('⚠️  Connection closed, reconnecting...'));
                    await delay(3000);
                    startXeonBotInc();
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log(chalk.yellow('⚠️  Connection Lost from Server, reconnecting...'));
                    await delay(3000);
                    startXeonBotInc();
                } else if (reason === DisconnectReason.connectionReplaced) {
                    console.log(chalk.red('❌ Connection Replaced, Another New Session Opened'));
                    process.exit(1);
                } else if (reason === DisconnectReason.loggedOut) {
                    console.log(chalk.red('❌ Device Logged Out, Please Delete Session and Scan Again.'));
                    try {
                        rmSync('./session', { recursive: true, force: true });
                    } catch {}
                    process.exit(1);
                } else if (reason === DisconnectReason.restartRequired) {
                    console.log(chalk.yellow('⚠️  Restart Required, Restarting...'));
                    await delay(2000);
                    startXeonBotInc();
                } else if (reason === DisconnectReason.timedOut) {
                    console.log(chalk.yellow('⚠️  Connection TimedOut, Reconnecting...'));
                    await delay(3000);
                    startXeonBotInc();
                } else {
                    console.log(chalk.red(`❌ Unknown DisconnectReason: ${reason}|${connection}`));
                    await delay(3000);
                    startXeonBotInc();
                }
            } else if (connection === 'open') {
                console.log('');
                console.log(chalk.green('╔═════════════════════════════════╗'));
                console.log(chalk.green('║                                        ║'));
                console.log(chalk.green('║        ✅ SUCCESSFULLY CONNECTED       ║'));
                console.log(chalk.green('║                                        ║'));
                console.log(chalk.green('╚═════════════════════════════════╝'));
                console.log('');
                console.log(chalk.cyan(''));
                console.log(chalk.cyan(''));
                console.log(chalk.cyan(''));
                console.log('');
                console.log(chalk.greenBright(`  🤖  BotName: ${XeonBotInc.user.name || 'Moon Xmd'}`));
                console.log(chalk.greenBright(`  📱 OwnerNumber: ${XeonBotInc.user.id.split(':')[0]}`));
                console.log(chalk.greenBright(`  📅  Date: ${new Date().toLocaleDateString()}`));
                console.log(chalk.greenBright(`  ⏰  Time: ${new Date().toLocaleTimeString()}`));
                console.log(chalk.greenBright(`  🔢  Version: ${settings.version || '1.0.0'}`));
                console.log('');

                try {
                    const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                    await XeonBotInc.sendMessage(botNumber, {
                        text: `
> ╔═════════════════╗
> ║    *MOON ＸＭＤ*           
> ║  SUCCESSFULLY CONNECTED ✅       
> ╠═════════════════╣
> ║  ＰＲＥＦＩＸ: [ *${prefix}* ]            
> ╟─────────────────╢
> ║ 🖇️ ＣＨＡＮＮＥＬ ＬＩＮＫ         
> ║ https://whatsapp.com/channel/0029VbANWX1DuMRi1VNPIB0y              
> ╟─────────────────╢
> ║ 🖇️ ＧＲＯＵＰ ＬＩＮＫ          
> ║ https://chat.whatsapp.com/Bn1kDJrTGBi88ncw98PkGt?mode=ac_t                 
> ╠═════════════════╣
> ║   *MOON ＸＭＤ*               
> ║  © ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴋᴇɪᴛʜ        
> ╚═════════════════╝`,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363417440480101@newsletter',
                                newsletterName: 'MOON XMD',
                                serverMessageId: -1
                            }
                        }
                    });
                } catch (error) {
                    console.error(chalk.red('Error sending connection message:'), error.message)
                }
            }
        })

        // Track recently-notified callers to avoid spamming messages
        const antiCallNotified = new Set();

        XeonBotInc.ev.on('call', async (calls) => {
            try {
                const { readState: readAnticallState } = require('./commands/anticall');
                const state = readAnticallState();
                if (!state.enabled) return;
                for (const call of calls) {
                    const callerJid = call.from || call.peerJid || call.chatId;
                    if (!callerJid) continue;
                    try {
                        try {
                            if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                                await XeonBotInc.rejectCall(call.id, callerJid);
                            } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                                await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                            }
                        } catch {}

                        if (!antiCallNotified.has(callerJid)) {
                            antiCallNotified.add(callerJid);
                            setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                            await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                        }
                    } catch {}
                    setTimeout(async () => {
                        try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                    }, 800);
                }
            } catch (e) {}
        });

        XeonBotInc.ev.on('group-participants.update', async (update) => {
            await handleGroupParticipantUpdate(XeonBotInc, update);
        });

        XeonBotInc.ev.on('messages.upsert', async (m) => {
            if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, m);
            }
        });

        XeonBotInc.ev.on('status.update', async (status) => {
            await handleStatus(XeonBotInc, status);
        });

        XeonBotInc.ev.on('messages.reaction', async (status) => {
            await handleStatus(XeonBotInc, status);
        });

        return XeonBotInc
    } catch (error) {
        console.error(chalk.red('❌ Error in startXeonBotInc:'), error.message)
        await delay(5000)
        startXeonBotInc()
    }
}

// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error(chalk.red('❌ Fatal error:'), error)
    process.exit(1)
})

process.on('uncaughtException', (err) => {
    console.error(chalk.red('Uncaught Exception:'), err)
})

process.on('unhandledRejection', (err) => {
    console.error(chalk.red('Unhandled Rejection:'), err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})