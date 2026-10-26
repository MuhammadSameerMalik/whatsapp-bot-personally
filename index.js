// ---------------------------------------------------------------------------
// 🔇 Suppress noisy internal Signal-protocol debug logs
// ---------------------------------------------------------------------------

const NOISY_LOG_PATTERNS = [
    /^Closing session:/,
    /^Decrypted message with closed session/,
    /^Session error:/,
    /^Failed to decrypt message/,
]
const _originalConsoleLog = console.log.bind(console)
const _originalConsoleError = console.error.bind(console)
function _isNoisySignalLog(args) {
    return args.some((arg) => typeof arg === 'string' && NOISY_LOG_PATTERNS.some((re) => re.test(arg)))
}
console.log = (...args) => {
    if (_isNoisySignalLog(args)) return
    _originalConsoleLog(...args)
}
console.error = (...args) => {
    if (_isNoisySignalLog(args)) return
    _originalConsoleError(...args)
}

require('dotenv').config()
const settings = require('./settings')

const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage,
    jidDecode,
    makeCacheableSignalKeyStore,
    delay,
    Browsers
} = require('@whiskeysockets/baileys')
const NodeCache = require('node-cache')
const pino = require('pino')

// ---------------------------------------------------------------------------
// Identity Settings
// ---------------------------------------------------------------------------
global.botname = settings.botName || 'Sam'
global.ownername = settings.botOwner || 'Sameer Malik'

const configuredOwnerNumber = (settings.ownerNumber || '923238867440').replace(/[^0-9]/g, '')
global.owner = configuredOwnerNumber ? [configuredOwnerNumber] : []

const phoneNumber = configuredOwnerNumber
const pairingCode = true

const BASE_RETRY_DELAY_MS = settings.reconnectDelayMs || 5000
const MAX_RETRY_DELAY_MS = settings.reconnectMaxDelayMs || 60000
const TRIGGER_WORDS = new Set([
    // Original words
    'nice', 'hmm', 'ok', 'okay', 'mashallah', 'cute', 'wow', 'amazing', 'awesome',
    'great', 'superb', 'fantastic', 'brilliant', 'excellent', 'cool', 'good',
    'niceee', 'nicee', 'n1ce', 'thanks', 'thank you', 'thx', 'thnx', 'thnks',
    'thnk u', 'thnk you', 'thx a lot', 'not', 'no', 'acha', 'yhe cheez', 'haha',
    'lol', 'acha g', 'thik', 'onceview', 'hahaa', 'hahah', 'thk ha', 'thik ho giya',
    'yhe baat', 'hahahaha',

    // English reactions
    'beautiful', 'gorgeous', 'stunning', 'lovely', 'pretty', 'hot', 'sexy',
    'cute pic', 'nice pic', 'nice picture', 'good picture', 'wow nice', 'omg',
    'omg nice', 'damn', 'daaamn', 'damnnn', 'fire', 'lit', 'so nice', 'so cute',
    'so beautiful', 'so good', 'so sweet', 'sweet', 'perfect', 'perfecto',
    'love it', 'love this', 'i love it', 'nice one', 'good one', 'well done',
    'good job', 'nice shot', 'great shot', 'awesome pic', 'amazing pic',
    'stunning pic', 'gorgeous pic', 'beautiful pic', 'wow beautiful', 'superb pic',
    'epic', 'epic pic', 'insane', 'insane pic', 'crazy', 'crazy pic',
    'unbelievable', 'incredible', 'marvelous', 'marvellous', 'outstanding', 'top',
    'top notch', 'killer', 'killer pic', 'savage', 'goated', 'legit', 'legit pic',
    'valid', 'valid pic', 'respect', 'salute', 'facts', 'true', 'based',

    // Roman Urdu appreciation
    'wah', 'wah wah', 'wah bhai', 'mast', 'mast hai', 'mast pic', 'mast picture',
    'zabardast', 'zabardast hai', 'zabardast pic', 'kamaal', 'kamaal hai',
    'kamaal pic', 'kamal pic', 'kya baat hai', 'kya baat', 'kya baat h',
    'kya baat h yr', 'behtareen', 'behtareen hai', 'shandar', 'shandar hai',
    'badhiya', 'badhiya hai', 'badhiya h', 'badiya', 'badiya hai', 'umda',
    'umda hai', 'lajawab', 'lajawab hai', 'sahi hai', 'sahi h', 'sahi', 'chal ja',
    'chalega', 'chalta hai', 'subhanallah', 'mashaallah', 'masha allah',
    'alhamdulillah', 'inshallah', 'allah pak', 'allah', 'god', 'omg wow', 'holy',
    'holy cow', 'holy moly', 'waah', 'waaah',

    // Acha / thik variants
    'acha hai', 'acha lga', 'acha laga', 'achi hai', 'achi lgi', 'achi lagi',
    'bohat acha', 'bohot acha', 'boht acha', 'bht acha', 'bht achi', 'bahut achi',
    'bahut acha', 'thik hai', 'thik h', 'theek hai', 'theek h',

    // Thanks variants
    'shukriya', 'shukria', 'meherbani', 'meharbani', 'bohot shukriya',
    'bohot shukria', 'thanks bhai', 'thanks yr', 'thanks yaar', 'thank u',
    'thank u so much', 'thanku', 'thanku so much', 'thnku', 'tnx', 'tq', 'tysm', 'ty',

    // Laughing
    'hahaha', 'hahahahaha', 'lolz', 'lmao', 'lmaooo', 'rofl', 'hehe', 'hehehe',
    'hihi', 'xd', 'funny', 'so funny', 'hilarious', 'hilarious pic', 'comedy gold',

    // Ok / acknowledgement
    'k', 'kk', 'kkk', 'okie', 'okey', 'okok', 'ok done', 'done', 'got it', 'seen',
    'noted', 'alright', 'alrighty', 'fine', 'fine hai', 'sure', 'sure hai',

    // Negative / meh
    'nah', 'nope', 'meh', 'eh', 'boring', 'not bad', 'not good',

    // View-once / save specific
    'once view', 'view once', 'save this', 'save kro', 'save karo', 'save kr do',
    'ye save karo', 'isko save karo', 'download kro', 'download karo',
    'screenshot', 'ss', 'ss lo', 'ss krlo',

    // Emoji reactions
    '😍', '😘', '😗', '😙', '😚', '🥰', '😻', '❤️', '💕', '💖', '💗', '💓', '💞',
    '💘', '💝', '♥️', '😂', '🤣', '😹', '😮', '😲', '😯', '😦', '😧', '😱', '🔥',
    '💯', '👏', '👏🏻', '👏🏼', '👏🏽', '👏🏾', '👏🏿', '👍', '👍🏻', '👍🏼', '👍🏽',
    '👍🏾', '👍🏿', '🙌', '🙌🏻', '🙌🏼', '🙌🏽', '🙌🏾', '🙌🏿', '✨', '🌟', '⭐️',
    '😊', '☺️', '🙂', '😁', '😀', '😃', '😄', '😆', '👌', '👌🏻', '👌🏼', '👌🏽',
    '👌🏾', '👌🏿', '😜', '😝', '😛', '🥵', '😳', '😎', '🤩', '💋', '👀', '😏',
    '🤤', '😇', '🥳', '🙈', '💐', '🌹', '🌸', '👑', '🥺', '😅', '🫶', '💦', '💃',
    '🕺', '🤗', '😌', '🥹', '🤍', '🖤', '💛', '💚', '💙', '💜', '🧡', '💫', '🌈',
    '🎉', '🎊', '🙊', '🙉', '🤭', '🥴', '😵', '🤯', '😡', '😠', '🤬', '😤', '😣',
    '😖', '😫', '😩', '😢', '😭', '😓', '😥', '😰', '😨', '😱', '🤯', '😵‍💫', '😴',
    '🥱', '🤤', '😪', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿',
    '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸',
    '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾',
    '👋🏿', '🤚', '🤚🏻', '🤚🏼', '🤚🏽', '🤚🏾', '🤚🏿', '🖐️', '🖐🏻', '🖐🏼', '🖐🏽', '🖐🏾',
    '🏿', '✋', '✋🏻', '✋🏼', '✋🏽', '✋️', '✋️', '🖖', '🖖🏻', '🖖🏼', '🖖️', '🖖️',
    '🖖️', '👌', '👌🏻', '👌🏼', '👌🏽', '👌🏾', '👌🏿', '🤌', '🤌🏻', '🤌🏼', '🤌🏽', '🤌🏾',
    ' Mott', '🤏', '🤏🏻', '🤏🏼', '🤏🏻️', '🤏🏻️', '🤏🏻️', '✌️', '✌🏻', '✌🏼', '✌🏽', '✌🏾',
    '✌🏿', '🤞', '🤞🏻', ' Cros', '🤞🏽', '🤞🏾', '🤞🏿', '🤟', '🤟🏻', '🤟🏼', '🤟️', '🤟️',
    '🤟️', '🤘', '🤘🏻', '🤘🏼', '🤘🏽', '🤘🏾', '🤘🏿', '🤙', '🤙🏻', '🤙🏼', '🤙🏽', '🤙️',
    '🤙️', '👈', '👈🏻', '👈🏼', '👈🏽', '👈🏾', '👈🏻', '👉', '👉🏻', '👉🏼', '👉🏽', '👉🏾',
    '👉🏿', '👆', '👆🏻', '👆🏼', '👆🏽', '👆🏾', '👆️', '🖕', '🖕🏻', '🖕🏼', '🖕️', '🖕️',
    '🖕️', '👇', '👇🏻', '👇🏼', '👇🏽', '👇🏾', '👇️', '☝️', '☝🏻', '☝🏼', '☝🏽', '☝🏾',
    '☝️️', '👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿', '👎', '👎🏻', '👎🏼', '👎️', '👎️',
    '👎️', '✊', '✊🏻', '✊🏼', '✊️', '✊️', '✊️', '👊', '👊🏻', '👊🏼', '👊️', '👊️',
    '👊️', '🤛', '🤛🏻', '🤛🏼', '🤛️', '🤛️', '🤛️', '🤜', '🤜🏻', '🤜🏼', '🤜️', '🤜️',
    '🤜️', '👏', '👏🏻', '👏🏼', '👏🏽', '👏🏾', '👏🏿', '🙌', '🙌🏻', '🙌🏼', '🙌🏽', '🙌🏾',
    '🙌🏿', '👐', '👐🏻', '👐🏼', '👐🏽', '👐🏾', '👐🏿', '🤲', '🤲🏻', '🤲🏼', '🤲🏽', '🤲️',
    '🤲️', '🤝', '🙏', '🙏🏻', '🙏🏼', '🙏🏽', '🙏🏾', '🙏🏿', '✍️', '✍🏻', '✍🏼', '✍️️',
    '✍️️', '✍️️', '💅', '💅🏻', '💅🏼', '💅️', '💅️', '💅️', '🤳', '💃', '💃🏻', '💃🏼',
    '💃️', '💃️', '💃️', '🕺', '🕺🏻', '🕺🏼', '🕺️', '🕺️', '🕺️', '🕴️', '🚶', '🚶‍♂️',
    '🚶‍♀️', '🧍', '🧍‍♂️', '🧍‍♀️', '🧎', '🧎‍♂️', '🧎‍♀️', '🏃', '🏃‍♂️', '🏃‍♀️',
    '👯', '👯‍♂️', '👯‍♀️', '🧖', '🧖‍♂️', '🧖‍♀️', '🧗', '🧗‍♂️', '🧗‍♀️', '🤺',
    '🏇', '⛷️', '🏂', '🏌️', '🏌️‍♂️', '🏌️‍♀️', '🏄', '🏄‍♂️', '🏄‍♀️', '🚣',
    '🚣‍♂️', '🚣‍♀️', '🏊', '🏊‍♂️', '🏊‍♀️', '⛹️', '⛹️‍♂️', '⛹️‍♀️', '🏋️',
    '🏋️‍♂️', '🏋️‍♀️', '🚴', '🚴‍♂️', '🚴‍♀️', '🚵', '🚵‍♂️', '🚵‍♀️', '🤸',
    '🤸‍♂️', '🤸‍♀️', '🤼', '🤼‍♂️', '🤼‍♀️', '🤽', '🤽‍♂️', '🤽‍♀️', '🤾',
    '🤾‍♂️', '🤾‍♀️', '🤹', '🤹‍♂️', '🤹‍♀️', '🧘', '🧘‍♂️', '🧘‍♀️', '🛀',
    '🛌', '🧑‍🤝‍🧑', '👭', '👫', '👬', '💏', '💑', '👪', '👨‍👩‍👦', '👨‍👩‍👧', '👨‍👩‍👧‍👦',
    '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👩‍👩‍👦', '👩‍👩‍👧', '👩‍👩‍👧‍👦', '👩‍👩‍👦‍👦', '👩‍👩‍👧‍👧', '👨‍👨‍👦',
    '👨‍👨‍👧', '👨‍👨‍👧‍👦', '👨‍👨‍👦‍👦', '👨‍👨‍👧‍👧', '🐶', '🐱', '🐭', '🐹', '🐰', '🦊',
    '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊',
    '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗',
    '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🕸', '🦂',
    '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟',
    '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘', '🦛', '🦏',
    '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐',
    '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🐓', '🦃', '🦚', '🦜', '🦢',
    '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔', '🐾',
    '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋',
    '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼',
    '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓',
    '🌔', '🌙', '🌎', '🌍', '🌏', '💫', '⭐️', '🌟', '✨', '⚡', '☄️', '💥', '🔥',
    '🌪', '🌈', '☀️', '🌤', '⛅️', '🌥', '☁️', '🌦', '🌧', '⛈', '🌩', '🌨', '❄️',
    '☃️', '⛄', '🌬', '💨', '💧', '💦', '☔', '☂️', '🌊', '🌫', '🍏', '🍎', '🍐',
    '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝',
    '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🥔', '🍠', '🥐', '🥯',
    '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭',
    '🍔', '🍟', '🍕', '🥪', '🥙', '🌮', '🌯', '🥗', '🥘', '🥫', '🍝', '🍜', '🍲',
    '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡',
    '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩',
    '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '☕️', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻',
    '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🥄', '🍴', '🍽', '🥣', '🥡', '🥢',
    '🧂', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓',
    '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋',
    '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏆', '🥇', '🥈', '🥉',
    '🏅', '🎖', '🏵', '🎗', '🎫', '🎟', '🎪', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧',
    '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟', '🎯', '🎳', '🎮',
    '🎰', '🧩'
])

// ---------------------------------------------------------------------------
// Paired Numbers Storage (Bypass & Feature Access)
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data')
const PAIR_FILE = path.join(DATA_DIR, 'paired-numbers.json')
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions')
let pairedNumbers = new Set()

const pairAttemptLocks = new Set()

function ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true })
}

function loadPairedNumbers() {
    ensureDirectories()
    if (!fs.existsSync(PAIR_FILE)) return
    try {
        const raw = fs.readFileSync(PAIR_FILE, 'utf8')
        if (raw.trim()) {
            const parsed = JSON.parse(raw)
            pairedNumbers = new Set(parsed)
        }
    } catch (error) {
        console.error('Failed to load paired numbers:', error)
    }
}

function savePairedNumbers() {
    ensureDirectories()
    try {
        fs.writeFileSync(PAIR_FILE, JSON.stringify(Array.from(pairedNumbers), null, 2))
    } catch (error) {
        console.error('Failed to save paired numbers:', error)
    }
}

// ---------------------------------------------------------------------------
// Scheduled Messages Storage (!birthday / !schedule command)
// ---------------------------------------------------------------------------

const SCHEDULE_FILE = path.join(DATA_DIR, 'scheduled-messages.json')
let scheduledMessages = []

function loadScheduledMessages() {
    ensureDirectories()
    if (!fs.existsSync(SCHEDULE_FILE)) return
    try {
        const raw = fs.readFileSync(SCHEDULE_FILE, 'utf8')
        if (raw.trim()) scheduledMessages = JSON.parse(raw)
    } catch (error) {
        console.error('Failed to load scheduled messages:', error)
    }
}

function saveScheduledMessages() {
    ensureDirectories()
    try {
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduledMessages, null, 2))
    } catch (error) {
        console.error('Failed to save scheduled messages:', error)
    }
}

// ---------------------------------------------------------------------------
// Scheduled Status Storage (!status command)
// ---------------------------------------------------------------------------

const STATUS_FILE = path.join(DATA_DIR, 'scheduled-status.json')
const STATUS_MEDIA_DIR = path.join(DATA_DIR, 'status-media')
let scheduledStatuses = []

function ensureStatusMediaDir() {
    if (!fs.existsSync(STATUS_MEDIA_DIR)) fs.mkdirSync(STATUS_MEDIA_DIR, { recursive: true })
}

function loadScheduledStatuses() {
    ensureDirectories()
    ensureStatusMediaDir()
    if (!fs.existsSync(STATUS_FILE)) return
    try {
        const raw = fs.readFileSync(STATUS_FILE, 'utf8')
        if (raw.trim()) scheduledStatuses = JSON.parse(raw)
    } catch (error) {
        console.error('Failed to load scheduled statuses:', error)
    }
}

function saveScheduledStatuses() {
    ensureDirectories()
    try {
        fs.writeFileSync(STATUS_FILE, JSON.stringify(scheduledStatuses, null, 2))
    } catch (error) {
        console.error('Failed to save scheduled statuses:', error)
    }
}

function extensionForMimetype(mimetype, mediaType) {
    const map = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
        'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
    }
    if (mimetype && map[mimetype]) return map[mimetype]
    return mediaType === 'video' ? 'mp4' : 'jpg'
}

function deleteStatusMediaFile(filePath) {
    if (!filePath) return
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (error) {
        console.error('Failed to delete status media file:', error)
    }
}

// ---------------------------------------------------------------------------
// 🗑️ Antidelete — INBOX ONLY (group deletions are always ignored)
//
// FIX: every stored entry and every media file is now scoped to the
// session that received it, so paired sessions can no longer see or
// overwrite each other's deleted-message data (privacy leak fix).
// ---------------------------------------------------------------------------
const ANTIDELETE_CONFIG_PATH = path.join(DATA_DIR, 'antidelete.json')
const ANTIDELETE_MEDIA_DIR = path.join(DATA_DIR, 'antidelete-media')
// key is now `${sessionId}:${messageId}` -> { content, mediaType, filePath, sender, chatId, timestamp }
const antideleteMessageStore = new Map()

function antideleteStoreKey(sessionId, messageId) {
    return `${sessionId}:${messageId}`
}

function ensureAntideleteMediaDir(sessionId) {
    const dir = sessionId
        ? path.join(ANTIDELETE_MEDIA_DIR, sessionId)
        : ANTIDELETE_MEDIA_DIR
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
}

// Default is ENABLED (auto-on) unless the owner has explicitly turned it off
// with `!antidelete off`. Scope is always inbox-only — group chats never
// trigger antidelete storage or reports, regardless of this setting.
function loadAntideleteConfig() {
    try {
        if (!fs.existsSync(ANTIDELETE_CONFIG_PATH)) return { enabled: true }
        const raw = fs.readFileSync(ANTIDELETE_CONFIG_PATH, 'utf8')
        if (!raw.trim()) return { enabled: true }
        const parsed = JSON.parse(raw)
        return { enabled: parsed.enabled !== false }
    } catch {
        return { enabled: true }
    }
}

function saveAntideleteConfig(config) {
    try {
        ensureDirectories()
        fs.writeFileSync(ANTIDELETE_CONFIG_PATH, JSON.stringify(config, null, 2))
    } catch (error) {
        console.error('Failed to save antidelete config:', error)
    }
}

function getFolderSizeInMB(folderPath) {
    try {
        if (!fs.existsSync(folderPath)) return 0
        const files = fs.readdirSync(folderPath)
        let totalSize = 0
        for (const file of files) {
            const filePath = path.join(folderPath, file)
            if (fs.statSync(filePath).isFile()) totalSize += fs.statSync(filePath).size
        }
        return totalSize / (1024 * 1024)
    } catch (err) {
        console.error('Error getting folder size:', err)
        return 0
    }
}

function cleanFolderIfLarge(folderPath, limitMB) {
    try {
        if (getFolderSizeInMB(folderPath) <= limitMB) return
        const files = fs.readdirSync(folderPath)
        for (const file of files) {
            try { fs.unlinkSync(path.join(folderPath, file)) } catch {}
        }
    } catch (err) {
        console.error('Antidelete media cleanup error:', err)
    }
}

// Stores every INBOX (non-group, non-status) message the antidelete cache
// might need to recover later if it gets deleted. Text, image, video,
// sticker and voice/audio are all supported. Messages sent by the bot's own
// number (fromMe) are skipped — nothing to "recover" for our own sends.
//
// FIX: sessionId is now required and used both as the in-memory Map key
// prefix and as the on-disk media subfolder, so paired sessions can never
// read or clobber each other's stored data.
async function storeMessageForAntidelete(message, sessionId) {
    try {
        const config = loadAntideleteConfig()
        if (!config.enabled) return
        if (message.key?.fromMe) return
        if (!sessionId) {
            console.error('storeMessageForAntidelete: missing sessionId, refusing to store (would leak across sessions)')
            return
        }

        const chatId = message.key?.remoteJid
        if (!chatId || !message.key?.id) return
        if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return // groups & status ignored

        const messageId = message.key.id
        const storeKey = antideleteStoreKey(sessionId, messageId)
        const sender = message.key.participant || message.key.remoteJid
        const content = extractText(message.message)
        const mediaInfo = getMediaInfo(message.message)

        let mediaType = ''
        let filePath = ''

        if (mediaInfo.media && ['image', 'video', 'sticker', 'audio'].includes(mediaInfo.type)) {
            const buffer = await downloadMessageMedia(message)
            if (buffer) {
                const sessionMediaDir = ensureAntideleteMediaDir(sessionId)
                let ext
                if (mediaInfo.type === 'sticker') ext = 'webp'
                else if (mediaInfo.type === 'audio') ext = (mediaInfo.media.mimetype || '').includes('ogg') ? 'ogg' : 'mp3'
                else ext = extensionForMimetype(mediaInfo.media.mimetype, mediaInfo.type)
                filePath = path.join(sessionMediaDir, `${messageId}.${ext}`)
                fs.writeFileSync(filePath, buffer)
                mediaType = mediaInfo.type
            } else {
                // Media never got downloaded — this is why the recovery report
                // for this message will show "no media", even though the
                // deletion itself was detected correctly.
                console.error(`[${sessionId}] antidelete: media download FAILED for message ${messageId} (type=${mediaInfo.type})`)
            }
        }

        if (!content && !mediaType) return

        antideleteMessageStore.set(storeKey, {
            content, mediaType, filePath, sender, chatId, timestamp: new Date().toISOString(),
        })
    } catch (error) {
        console.error('storeMessageForAntidelete error:', error)
    }
}

// Called when an inbox message gets deleted ("delete for everyone"). Sends
// the recovered text/photo/video/sticker/voice to the session's own
// self-chat. Groups are always ignored, even if antidelete is enabled.
//
// FIX: looks the message up by the same session-scoped key it was stored
// with, so a paired session can only ever recover its own deleted messages
// — never another paired number's.
async function handleMessageRevocationForAntidelete(sock, revocationMessage, sessionId) {
    try {
        const config = loadAntideleteConfig()
        if (!config.enabled) return
        if (!sessionId) {
            console.error('handleMessageRevocationForAntidelete: missing sessionId, refusing to look up (would leak across sessions)')
            return
        }

        const chatId = revocationMessage.key?.remoteJid
        if (!chatId) return
        if (chatId.endsWith('@g.us') || chatId === 'status@broadcast') return

        const messageId = revocationMessage.message?.protocolMessage?.key?.id
        if (!messageId) return

        const storeKey = antideleteStoreKey(sessionId, messageId)
        const original = antideleteMessageStore.get(storeKey)
        if (!original) return

        const selfJid = getSessionSelfJid(sock)
        if (!selfJid) return

        const sender = original.sender
        const senderNumber = normalizeNumber(String(sender).split('@')[0])

        const time = new Date().toLocaleString('en-GB', {
            timeZone: 'Asia/Karachi',
            hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit',
            day: '2-digit', month: '2-digit', year: 'numeric',
        })

        let text = `*🔰 ANTIDELETE REPORT (Inbox) 🔰*\n\n` +
            `*👤 Sender:* @${senderNumber}\n` +
            `*🕒 Time:* ${time}\n`

        if (original.content) {
            text += `\n*💬 Deleted Message:*\n${original.content}`
        }

        await sock.sendMessage(selfJid, { text, mentions: [sender] })

        if (original.mediaType && original.filePath && fs.existsSync(original.filePath)) {
            try {
                const buffer = fs.readFileSync(original.filePath)
                const caption = `*Deleted ${original.mediaType}*\nFrom: @${senderNumber}`
                switch (original.mediaType) {
                    case 'image':
                        await sock.sendMessage(selfJid, { image: buffer, caption, mentions: [sender] })
                        break
                    case 'video':
                        await sock.sendMessage(selfJid, { video: buffer, caption, mentions: [sender] })
                        break
                    case 'sticker':
                        await sock.sendMessage(selfJid, { sticker: buffer, mentions: [sender] })
                        break
                    case 'audio':
                        // Recovers voice notes (ptt) and normal audio messages
                        await sock.sendMessage(selfJid, { audio: buffer, mimetype: 'audio/mpeg', ptt: false, caption, mentions: [sender] })
                        break
                }
            } catch (err) {
                await sock.sendMessage(selfJid, { text: `⚠️ Error sending recovered media: ${err.message}` })
            }
            try { fs.unlinkSync(original.filePath) } catch (err) { console.error('Antidelete media cleanup error:', err) }
        } else if (original.mediaType) {
            // We know media WAS attached to the deleted message, but we don't
            // have a recovered file for it (download failed at store time).
            await sock.sendMessage(selfJid, {
                text: `⚠️ Is message ke sath ${original.mediaType} thi, lekin wo download nahi ho saki thi is liye recover nahi ho sakti.`
            })
        }

        antideleteMessageStore.delete(storeKey)
    } catch (error) {
        console.error('handleMessageRevocationForAntidelete error:', error)
    }
}

// ---------------------------------------------------------------------------
// Status Recipients Storage (needed for posting to status@broadcast)
// ---------------------------------------------------------------------------

function statusRecipientsFilePath(sessionId) {
    return path.join(DATA_DIR, `status-recipients-${sessionId}.json`)
}

function loadStatusRecipients(sessionId) {
    try {
        const file = statusRecipientsFilePath(sessionId)
        if (!fs.existsSync(file)) return new Set()
        const raw = fs.readFileSync(file, 'utf8')
        if (!raw.trim()) return new Set()
        return new Set(JSON.parse(raw))
    } catch (error) {
        console.error(`Failed to load status recipients for ${sessionId}:`, error)
        return new Set()
    }
}

function saveStatusRecipients(sessionId, recipientsSet) {
    try {
        ensureDirectories()
        fs.writeFileSync(statusRecipientsFilePath(sessionId), JSON.stringify(Array.from(recipientsSet), null, 2))
    } catch (error) {
        console.error(`Failed to save status recipients for ${sessionId}:`, error)
    }
}

function addStatusRecipient(sessionId, sessionState, jid) {
    if (!jid || !sessionState?.statusRecipients) return
    if (!jid.endsWith('@s.whatsapp.net')) return
    if (sessionState.statusRecipients.has(jid)) return
    sessionState.statusRecipients.add(jid)
    saveStatusRecipients(sessionId, sessionState.statusRecipients)
}

// ---------------------------------------------------------------------------
// Status Audience Override (privacy — "only share status with these people")
// ---------------------------------------------------------------------------

function statusAudienceFilePath(sessionId) {
    return path.join(DATA_DIR, `status-audience-${sessionId}.json`)
}

function loadStatusAudience(sessionId) {
    try {
        const file = statusAudienceFilePath(sessionId)
        if (!fs.existsSync(file)) return new Set()
        const raw = fs.readFileSync(file, 'utf8')
        if (!raw.trim()) return new Set()
        return new Set(JSON.parse(raw))
    } catch (error) {
        console.error(`Failed to load status audience for ${sessionId}:`, error)
        return new Set()
    }
}

function saveStatusAudience(sessionId, audienceSet) {
    try {
        ensureDirectories()
        fs.writeFileSync(statusAudienceFilePath(sessionId), JSON.stringify(Array.from(audienceSet), null, 2))
    } catch (error) {
        console.error(`Failed to save status audience for ${sessionId}:`, error)
    }
}

// The list actually used when posting a status: the custom audience if one
// has been set, otherwise every auto-learned contact — with the session's
// own number always included so the status still shows on its own tab.
function getEffectiveStatusJidList(sessionId, sessionState) {
    const selfJid = getSessionSelfJid(sessionState?.sock)
    const base = (sessionState?.statusAudience && sessionState.statusAudience.size > 0)
        ? Array.from(sessionState.statusAudience)
        : Array.from(sessionState?.statusRecipients || [])
    if (selfJid && !base.includes(selfJid)) base.push(selfJid)
    return base
}

// ---------------------------------------------------------------------------
// Posted Statuses Log — needed to properly DELETE/REVOKE a status later.
// ---------------------------------------------------------------------------

const POSTED_STATUS_FILE = path.join(DATA_DIR, 'posted-statuses.json')
let postedStatuses = []

function loadPostedStatuses() {
    ensureDirectories()
    if (!fs.existsSync(POSTED_STATUS_FILE)) return
    try {
        const raw = fs.readFileSync(POSTED_STATUS_FILE, 'utf8')
        if (raw.trim()) postedStatuses = JSON.parse(raw)
    } catch (error) {
        console.error('Failed to load posted statuses:', error)
    }
}

function savePostedStatuses() {
    ensureDirectories()
    try {
        fs.writeFileSync(POSTED_STATUS_FILE, JSON.stringify(postedStatuses, null, 2))
    } catch (error) {
        console.error('Failed to save posted statuses:', error)
    }
}

function prunePostedStatuses() {
    const now = Date.now()
    const before = postedStatuses.length
    postedStatuses = postedStatuses.filter((e) => now - new Date(e.postedAt).getTime() < 24 * 60 * 60 * 1000)
    if (postedStatuses.length !== before) savePostedStatuses()
}

function parseRecipientNumbersToJids(raw) {
    return String(raw || '')
        .split(',')
        .map((v) => v.replace(/[^0-9]/g, ''))
        .filter((v) => v.length > 5 && v.length < 20)
        .map((v) => `${v}@s.whatsapp.net`)
}

function resolveTargetJid(raw) {
    const trimmed = String(raw || '').trim()
    if (trimmed.endsWith('@g.us')) return { jid: trimmed, type: 'group' }
    if (trimmed.endsWith('@s.whatsapp.net')) return { jid: trimmed, type: 'individual' }
    if (/^\d+-\d+$/.test(trimmed)) return { jid: `${trimmed}@g.us`, type: 'group' }
    const digits = trimmed.replace(/[^0-9]/g, '')
    if (digits.length > 5 && digits.length < 20) return { jid: `${digits}@s.whatsapp.net`, type: 'individual' }
    return null
}

async function formatTargetDisplay(sock, targetJid, targetType) {
    if (targetType === 'group') {
        try {
            const meta = await sock.groupMetadata(targetJid)
            if (meta?.subject) return meta.subject
        } catch (error) {
        }
        return targetJid
    }
    const digits = String(targetJid || '').split('@')[0]
    return digits ? `+${digits}` : targetJid
}

function pad2(n) { return String(n).padStart(2, '0') }

function pktDateParts(date) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const out = {}
    fmt.formatToParts(date).forEach((p) => { out[p.type] = p.value })
    return {
        year: Number(out.year), month: Number(out.month), day: Number(out.day),
        hour: Number(out.hour) % 24, minute: Number(out.minute),
    }
}

function pktDateOffsetByDays(days) {
    const now = pktDateParts(new Date())
    // Anchor at PKT noon (avoids any midnight edge-case) then shift by whole days.
    const anchor = new Date(`${now.year}-${pad2(now.month)}-${pad2(now.day)}T12:00:00+05:00`)
    const shifted = new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000)
    return pktDateParts(shifted)
}

function parseTimeToken(raw) {
    const t = String(raw || '').trim().toLowerCase().replace(/\s+/g, '')
    let m = t.match(/^(\d{1,2}):(\d{2})$/) // 24-hour "17:00"
    if (m) {
        const hour = Number(m[1]), minute = Number(m[2])
        if (hour > 23 || minute > 59) return null
        return { hour, minute }
    }
    m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/)
    if (m) {
        let hour = Number(m[1]) % 12
        const minute = m[2] ? Number(m[2]) : 0
        if (hour > 12 || minute > 59) return null
        if (m[3] === 'pm') hour += 12
        return { hour, minute }
    }
    return null
}

function parseDateToken(raw) {
    const t = String(raw || '').trim().toLowerCase()
    if (t === 'today' || t === 'aaj') {
        const p = pktDateOffsetByDays(0)
        return { year: p.year, month: p.month, day: p.day, autoRollYear: false }
    }
    if (t === 'tomorrow' || t === 'kal') {
        const p = pktDateOffsetByDays(1)
        return { year: p.year, month: p.month, day: p.day, autoRollYear: false }
    }
    let m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/) // DD-MM-YYYY
    if (m) {
        const day = Number(m[1]), month = Number(m[2]), year = Number(m[3])
        if (month < 1 || month > 12 || day < 1 || day > 31) return null
        return { year, month, day, autoRollYear: false }
    }
    m = t.match(/^(\d{1,2})-(\d{1,2})$/) // DD-MM (year implied)
    if (m) {
        const day = Number(m[1]), month = Number(m[2])
        if (month < 1 || month > 12 || day < 1 || day > 31) return null
        return { year: pktDateParts(new Date()).year, month, day, autoRollYear: true }
    }
    return null
}

function parseFlexibleDateTime(dateStr, timeStr) {
    const dateParts = parseDateToken(dateStr)
    const timeParts = parseTimeToken(timeStr)
    if (!dateParts || !timeParts) return null

    const build = (year) => new Date(
        `${year}-${pad2(dateParts.month)}-${pad2(dateParts.day)}T${pad2(timeParts.hour)}:${pad2(timeParts.minute)}:00+05:00`
    )

    let date = build(dateParts.year)
    if (isNaN(date.getTime())) return null

    if (dateParts.autoRollYear && date.getTime() <= Date.now()) {
        date = build(dateParts.year + 1)
    }

    return date
}

// ---------------------------------------------------------------------------
// Shared message helpers
// ---------------------------------------------------------------------------
function safeInterval(name, task, intervalMs) {
    setInterval(() => {
        try {
            const result = task()
            if (result?.catch) result.catch((error) => console.error(`${name} failed:`, error))
        } catch (error) {
            console.error(`${name} failed:`, error)
        }
    }, intervalMs)
}

function getSessionSelfJid(sock) {
    const rawId = sock?.user?.id
    if (!rawId) return null
    const [rawNumber] = rawId.split(':')
    const number = normalizeNumber(rawNumber)
    return number ? `${number}@s.whatsapp.net` : null
}

function normalizeNumber(value) {
    return String(value || '').replace(/[^0-9]/g, '')
}

function parseCommand(text) {
    const normalized = String(text || '').trim()
    const match = normalized.match(/^!(pair|unpair|pairlist|birthday|schedule|groups|group|scheduledlist|cancelschedule|status|statuslist|cancelstatus|statusaudience|deletestatus|postedstatuses|antidelete|help)(?:\s+(.*))?$/i)
    if (!match) return null
    return {
        name: match[1].toLowerCase(),
        arg: (match[2] || '').trim(),
    }
}

// ---------------------------------------------------------------------------
// Media Unwrapping
// ---------------------------------------------------------------------------
function unwrapMessageContent(message) {
    if (!message) return {}
    const outer = message.ephemeralMessage?.message || message
    return outer.viewOnceMessageV2?.message
        || outer.viewOnceMessage?.message
        || outer.viewOnceMessageV2Extension?.message
        || outer
}

// Distinguishes an actual view-once message from a normal one — used to
// decide what's worth caching for the "react to save" feature, so we don't
// waste memory caching every regular photo/video that passes through.
function isViewOnceMessage(message) {
    if (!message) return false
    const outer = message.ephemeralMessage?.message || message
    return Boolean(outer.viewOnceMessageV2 || outer.viewOnceMessage || outer.viewOnceMessageV2Extension)
}

function viewOnceCacheKey(chatId, msgId) {
    return String(msgId)
}

function extractText(message) {
    const content = unwrapMessageContent(message)
    return content?.conversation
        || content?.extendedTextMessage?.text
        || content?.imageMessage?.caption
        || content?.videoMessage?.caption
        || content?.documentMessage?.caption
        || ''
}

function normalizeTriggerText(rawText) {
    return String(rawText || '')
        .trim()
        .toLowerCase()
        .replace(/[!.,?~]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
}

function getMediaInfo(message) {
    const content = unwrapMessageContent(message)
    if (content.imageMessage) return { type: 'image', media: content.imageMessage, content }
    if (content.videoMessage) return { type: 'video', media: content.videoMessage, content }
    if (content.stickerMessage) return { type: 'sticker', media: content.stickerMessage, content }
    if (content.audioMessage) return { type: 'audio', media: content.audioMessage, content }
    if (content.documentMessage) return { type: 'document', media: content.documentMessage, content }
    return { type: '', media: null, content }
}

async function downloadMessageMedia(message) {
    try {
        const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger: pino({ level: 'silent' }) })
        return buffer?.length ? buffer : null
    } catch (error) {
        console.error('Media download failed:', error?.message || error)
        return null
    }
}

async function sendMediaToTarget(sock, targetJid, buffer, mediaInfo, options = {}) {
    const { content, media } = mediaInfo
    if (content.videoMessage) {
        await sock.sendMessage(targetJid, { video: buffer, ...options })
        return
    }
    if (content.audioMessage) {
        await sock.sendMessage(targetJid, { audio: buffer, mimetype: media.mimetype || 'audio/mpeg', ptt: false, ...options })
        return
    }
    if (content.documentMessage) {
        await sock.sendMessage(targetJid, {
            document: buffer,
            mimetype: media.mimetype || 'application/octet-stream',
            fileName: media.fileName || 'file',
            ...options,
        })
        return
    }
    await sock.sendMessage(targetJid, { image: buffer, ...options })
}

async function postStatusUpdate(sock, content, statusJidList, extraOptions = {}) {
    return await sock.sendMessage('status@broadcast', content, {
        ...extraOptions,
        statusJidList: statusJidList || [],
        broadcast: true,
    })
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCommands(sock, message) {
    try {
        const fromMe = Boolean(message.key?.fromMe)
        if (!fromMe) return

        const chatId = message.key?.remoteJid
        if (!chatId) return

        const command = parseCommand(extractText(message.message))
        if (!command) return

        if (command.name === 'pair') {
            const rawArg = command.arg
            if (!rawArg) {
                return await sock.sendMessage(chatId, {
                    text: `Please provide a valid WhatsApp number\nExample: !pair 923238867440`
                })
            }

            const numbers = rawArg.split(',')
                .map((v) => v.replace(/[^0-9]/g, ''))
                .filter((v) => v.length > 5 && v.length < 20)

            if (numbers.length === 0) {
                return await sock.sendMessage(chatId, {
                    text: "Invalid number❌️ Please use the correct format!"
                })
            }

            for (const number of numbers) {
                if (pairAttemptLocks.has(number)) {
                    continue
                }
                pairAttemptLocks.add(number)
                setTimeout(() => pairAttemptLocks.delete(number), 30 * 1000)

                if (pairedNumbers.has(number)) {
                    await sock.sendMessage(chatId, { text: `ℹ️ Number +${number} pehle se hi paired hai aur apna session chala raha hai.` })
                    continue
                }

                const whatsappID = number + '@s.whatsapp.net'
                const result = await sock.onWhatsApp(whatsappID)

                if (!result[0]?.exists) {
                    await sock.sendMessage(chatId, {
                        text: `That number (+${number}) is not registered on WhatsApp❗️`
                    })
                    continue
                }

                await sock.sendMessage(chatId, {
                    text: `Generating secure local pairing code for +${number}... Please wait.`
                })

                const sessionId = `paired-${number}`
                const authFolder = path.join(SESSIONS_DIR, number)

                try {
                    if (fs.existsSync(authFolder)) {
                        fs.rmSync(authFolder, { recursive: true, force: true })
                    }
                } catch (cleanupError) {
                    console.error('Failed clearing stale session folder:', cleanupError)
                }
                pairingCodeSentFor.delete(sessionId)

                try {
                    await startSession(sessionId, {
                        authFolder,
                        isPrimary: false,
                        pairNumber: number,
                        notifyChatId: chatId,
                        notifySock: sock,
                    })
                } catch (apiError) {
                    console.error('Local Pairing Error:', apiError)
                    await sock.sendMessage(chatId, {
                        text: "WhatsApp core network temporary reject. Please try again after some minutes."
                    })
                }
            }

        } else if (command.name === 'unpair') {
            const target = normalizeNumber(command.arg)
            if (!target) return await sock.sendMessage(chatId, { text: '❌ Number mention karein. Example: `!unpair 923001234567`' })
            if (pairedNumbers.has(target)) {
                const sessionId = `paired-${target}`
                closeSession(sessionId)
                sessions.delete(sessionId)
                pairingCodeSentFor.delete(sessionId)

                const authFolder = path.join(SESSIONS_DIR, target)
                try {
                    fs.rmSync(authFolder, { recursive: true, force: true })
                } catch (error) {
                    console.error('Failed removing session folder:', error)
                }

                // Also clean up this session's own antidelete media folder and
                // any of its in-memory antidelete entries, so nothing lingers
                // after unpair.
                try {
                    const sessionMediaDir = path.join(ANTIDELETE_MEDIA_DIR, sessionId)
                    if (fs.existsSync(sessionMediaDir)) fs.rmSync(sessionMediaDir, { recursive: true, force: true })
                } catch (error) {
                    console.error('Failed removing session antidelete media folder:', error)
                }
                for (const key of [...antideleteMessageStore.keys()]) {
                    if (key.startsWith(`${sessionId}:`)) antideleteMessageStore.delete(key)
                }

                pairedNumbers.delete(target)
                savePairedNumbers()
                await sock.sendMessage(chatId, { text: `✅ Number +${target} ko unpair kar diya gaya hai aur uska session band kar diya gaya hai.` })
            } else {
                await sock.sendMessage(chatId, { text: `⚠️ Yeh number list mein maujood nahi hai.` })
            }
        } else if (command.name === 'pairlist') {
            if (pairedNumbers.size === 0) {
                return await sock.sendMessage(chatId, { text: '📋 Pair list bilkul khaali hai.' })
            }
            let listText = '*📋 Paired Numbers List:*\n\n'
            Array.from(pairedNumbers).forEach((num, index) => {
                const sessionState = sessions.get(`paired-${num}`)
                const status = sessionState?.connectionState === 'open' ? '🟢 online' : '🟡 connecting'
                listText += `${index + 1}. +${num} — ${status}\n`
            })
            await sock.sendMessage(chatId, { text: listText })
        }
    } catch (error) {
        console.error('Error in handleCommands:', error)
    }
}

let scheduleIdCounter = 1
function nextScheduleId() {
    return `sched_${Date.now()}_${scheduleIdCounter++}`
}

const WIZARD_TIMEOUT_MS = 2 * 60 * 1000

const birthdayWizards = new Map()

const SCHEDULE_MEDIA_DIR = path.join(DATA_DIR, 'schedule-media')
function ensureScheduleMediaDir() {
    if (!fs.existsSync(SCHEDULE_MEDIA_DIR)) fs.mkdirSync(SCHEDULE_MEDIA_DIR, { recursive: true })
}
function deleteScheduleMediaFile(filePath) {
    if (!filePath) return
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    } catch (error) {
        console.error('Failed to delete schedule media file:', error)
    }
}

function createScheduleEntry(sessionId, target, sendAtDate) {
    return {
        id: nextScheduleId(),
        sessionId,
        targetJid: target.jid,
        targetType: target.type,
        sendAt: sendAtDate.toISOString(),
        message: null, // caption/text — filled in by caller
        mediaType: null, // 'image' | 'video' | null (text-only)
        filePath: null, // path to saved media file, if any
        sent: false,
        skipped: false,
    }
}

function formatScheduledConfirmation(entry) {
    const when = new Date(entry.sendAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })
    const kind = entry.mediaType ? `${entry.mediaType} message` : 'text message'
    const preview = entry.message ? `\n\n"${entry.message}"` : ''
    return `✅ Scheduled! (ID: ${entry.id})\n📅 ${when} (PKT) par ${entry.targetType === 'group' ? 'is group' : 'is number'} ko ye ${kind} chala jayega:${preview}`
}

const BIRTHDAY_ONELINE_HELP = 'Format ghalat hai❌️\n' +
    'Example: `!birthday 923001234567 15-08 5pm Happy Birthday Ali! 🎉`\n' +
    '(`!schedule` bhi bilkul isi tarah kaam karta hai — dono ek hi command hain)\n' +
    'Date: `today`/`aaj`, `tomorrow`/`kal`, `DD-MM`, ya `DD-MM-YYYY`\n' +
    'Time: `17:00` ya `5pm`\n\n' +
    '📸 Photo/video bhejna ho to usi message ko caption ke tor par use karein\n' +
    '(photo/video attach karein aur caption mein: `!birthday 923001234567 15-08 5pm Happy Birthday!`)\n\n' +
    'Ya sirf `!birthday` (ya `!schedule`) likhein apni self-chat mein — bot step-by-step pooch lega.\n' +
    'Group ke liye group JID use karein (!group ya !groups se lein).'

const STATUS_ONELINE_HELP = 'Format ghalat hai❌️\n' +
    'Example: `!status 5pm` (koi text ke bagair, sirf attached photo/video)\n' +
    'Ya: `!status 5pm Good evening!`\n' +
    'Ya: `!status 15-08 5pm Eid Mubarak! 🎉`\n' +
    'Date (optional): `today`/`aaj`, `tomorrow`/`kal`, `DD-MM`, ya `DD-MM-YYYY`\n' +
    'Time: `17:00` ya `5pm`\n\n' +
    'Photo/video ke caption mein bhi likh saktay hain, ya sirf text status ke liye bina media ke.\n' +
    'Ya sirf `!status` likhein apni self-chat mein — bot step-by-step pooch lega.\n\n' +
    '🔒 Privacy: `!statusaudience 923001234567,923009876543` — sirf inhi logon ko status dikhega.\n' +
    '🗑️ Delete: `!postedstatuses` se live status ki ID lein, phir `!deletestatus <ID>` — sab ke liye hat jayega.'

// ---------------------------------------------------------------------------
// !help — full command reference
// ---------------------------------------------------------------------------

const HELP_TEXT_SCHEDULING = '*📖 Commands Guide*\n\n' +
    '*🗑️ Antidelete (Inbox Only)*\n' +
    '`!antidelete on` / `!antidelete off` — enable/disable karein\n' +
    '`!antidelete` (bina kuch likhe) — current status dekhein\n' +
    'Sirf private chats (inbox) mein kaam karta hai — group deletions hamesha ignore hoti hain.\n' +
    'Default khud-ba-khud ON hai. Text, photo, video, sticker aur voice/audio — sab recover ho kar aapki self-chat mein aa jate hain.\n\n' +
    '*📅 Messages (kisi number/group ko)*\n' +
    '`!birthday <number> <date> <time> <message>` — message schedule karein\n' +
    '  Example: `!birthday 923001234567 15-08 5pm Happy Birthday! 🎉`\n' +
    '  Photo/video bhi bhej saktay hain — media attach karein, caption mein wahi command likhein\n' +
    '`!schedule` — `!birthday` jaisa hi hai, dono same kaam karte hain\n' +
    '`!birthday` (bina kuch likhe) — apni self-chat mein step-by-step wizard\n' +
    '`!scheduledlist` — pending scheduled messages dekhein\n' +
    '`!cancelschedule <ID>` — koi pending message cancel karein\n' +
    '`!group` — is group ki JID lein (group ke andar likhein)\n' +
    '`!groups` — is session ke saare groups + unki JID ki list\n\n' +
    '*📸 WhatsApp Status*\n' +
    '`!status <time>` — koi photo/video attach karke ya bina media ke text status schedule karein\n' +
    '  Example: `!status 5pm` ya `!status 15-08 5pm Eid Mubarak! 🎉`\n' +
    '`!status` (bina kuch likhe) — apni self-chat mein step-by-step wizard\n' +
    '`!statuslist` — pending scheduled statuses dekhein\n' +
    '`!cancelstatus <ID>` — koi pending status cancel karein\n\n' +
    '*🔒 Status Privacy*\n' +
    '`!statusaudience 923001234567,923009876543` — sirf inhi logon ko naya status dikhega\n' +
    '`!statusaudience all` — wapas sab ko dikhana shuru\n' +
    '`!statusaudience` (bina kuch likhe) — abhi ki setting dekhein\n\n' +
    '*🗑️ Status Delete (sab ke liye)*\n' +
    '`!postedstatuses` — abhi jo status live hai unki ID list\n' +
    '`!deletestatus <ID>` — us status ko sab ke liye delete kar dein\n\n' +
    '*🖼️ View-Once Save*\n' +
    'Kisi view-once photo/video ko reply mein ya seedha react karke koi bhi appreciation emoji/word (👍, "nice", "acha", waghera) bhejein — bot use aapki self-chat mein save kar dega.\n\n' +
    'ℹ️ Kisi bhi step-by-step wizard ke dauran `!cancel` likh kar rok sakte hain.'

const HELP_TEXT_PAIRING = '\n\n*🔗 Number Pairing (sirf owner)*\n' +
    '`!pair <number>` — naya WhatsApp number is bot se link karein (pairing code milega)\n' +
    '`!unpair <number>` — kisi paired number ko hata dein\n' +
    '`!pairlist` — saare paired numbers aur unka status dekhein'

// Small wizard-redirect helper shared by !birthday/!schedule and !status —
// wizards may only start/continue in the bot's own self-chat.
function selfChatOnlyMessage(commandHint, onelineHint) {
    return `⚠️ Ye wizard sirf apni khud ki chat (Message Yourself) mein chalti hai.\n` +
        `Apna number wali self-chat kholein aur wahan ${commandHint} likhein.\n\n` +
        `Ya phir yahin one-line form use karein:\n${onelineHint}`
}

async function handleBirthdayWizardStep(sock, message, chatId, wizardKey, text) {
    const state = birthdayWizards.get(wizardKey)
    if (!state) return

    if (text.toLowerCase() === '!cancel') {
        birthdayWizards.delete(wizardKey)
        return await sock.sendMessage(chatId, { text: '❌ Schedule cancel kar diya gaya.' })
    }

    if (state.step === 'target') {
        const target = resolveTargetJid(text)
        if (!target) {
            state.lastPromptAt = Date.now()
            return await sock.sendMessage(chatId, { text: '❌ Ye number/group ID samajh nahi aayi. Dubara bhejein (ya `!cancel` likhein).' })
        }
        state.target = target
        state.step = 'datetime'
        state.lastPromptAt = Date.now()
        return await sock.sendMessage(chatId, { text: 'Kab bhejna hai? (jaisay: `kal 5pm`, `aaj 21:00`, ya `15-08 09:00`)' })
    }

    if (state.step === 'datetime') {
        const [dateStr, ...timeParts] = text.trim().split(/\s+/)
        const timeStr = timeParts.join(' ')
        const sendAtDate = parseFlexibleDateTime(dateStr, timeStr)
        if (!sendAtDate) {
            state.lastPromptAt = Date.now()
            return await sock.sendMessage(chatId, { text: '❌ Samajh nahi aaya. Format: `kal 5pm`, `aaj 21:00`, ya `15-08 09:00` (dubara bhejein, ya `!cancel`).' })
        }
        if (sendAtDate.getTime() <= Date.now()) {
            state.lastPromptAt = Date.now()
            return await sock.sendMessage(chatId, { text: '❌ Ye waqt guzar chuka hai. Aainda ka waqt dein.' })
        }
        state.sendAtDate = sendAtDate
        state.step = 'message'
        state.lastPromptAt = Date.now()
        return await sock.sendMessage(chatId, { text: 'Message likhein (ya photo/video bhejein, caption ke sath ya bagair):' })
    }

    if (state.step === 'message') {
        const mediaInfo = getMediaInfo(message.message)
        const caption = text.trim()

        // Photo/video attached — schedule it as a media message.
        if (mediaInfo.media && (mediaInfo.type === 'image' || mediaInfo.type === 'video')) {
            const buffer = await downloadMessageMedia(message)
            if (!buffer) {
                state.lastPromptAt = Date.now()
                return await sock.sendMessage(chatId, { text: '⚠️ Media download nahi ho saki. Dubara bhejein.' })
            }
            ensureScheduleMediaDir()
            const entry = createScheduleEntry(wizardKey.split(':')[0], state.target, state.sendAtDate)
            const ext = extensionForMimetype(mediaInfo.media.mimetype, mediaInfo.type)
            const filePath = path.join(SCHEDULE_MEDIA_DIR, `${entry.id}.${ext}`)
            try {
                fs.writeFileSync(filePath, buffer)
            } catch (error) {
                console.error('Failed to save schedule media:', error)
                state.lastPromptAt = Date.now()
                return await sock.sendMessage(chatId, { text: '⚠️ Media save nahi ho saki. Dubara try karein.' })
            }
            entry.mediaType = mediaInfo.type
            entry.filePath = filePath
            entry.message = caption
            scheduledMessages.push(entry)
            saveScheduledMessages()
            birthdayWizards.delete(wizardKey)
            return await sock.sendMessage(chatId, { text: formatScheduledConfirmation(entry) })
        }

        // Text-only path
        if (!caption) {
            state.lastPromptAt = Date.now()
            return await sock.sendMessage(chatId, { text: '❌ Message khali nahi ho sakta. Dubara likhein (ya photo/video bhejein):' })
        }
        const entry = createScheduleEntry(wizardKey.split(':')[0], state.target, state.sendAtDate)
        entry.message = caption
        scheduledMessages.push(entry)
        saveScheduledMessages()
        birthdayWizards.delete(wizardKey)
        return await sock.sendMessage(chatId, { text: formatScheduledConfirmation(entry) })
    }
}

const statusWizards = new Map()

function createStatusEntry(sessionId, sendAtDate) {
    return {
        id: nextScheduleId(),
        sessionId,
        type: null,
        filePath: null,
        caption: null,
        sendAt: sendAtDate.toISOString(),
        sent: false,
        skipped: false,
    }
}

function formatStatusConfirmation(entry) {
    const when = new Date(entry.sendAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })
    const kind = entry.type === 'text' ? 'text status' : `${entry.type} status`
    return `✅ Status Scheduled! (ID: ${entry.id})\n📅 ${when} (PKT) par ye ${kind} lag jayega.`
}

function parseStatusOneLineArgs(argString) {
    const parts = String(argString || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return null

    const [first, second, ...rest] = parts

    const dateParts = parseDateToken(first)
    if (dateParts) {
        const sendAtDate = parseFlexibleDateTime(first, second)
        if (!sendAtDate) return null
        return { sendAtDate, captionParts: rest }
    }

    const timeParts = parseTimeToken(first)
    if (!timeParts) return null

    const todayParts = pktDateOffsetByDays(0)
    let sendAtDate = new Date(
        `${todayParts.year}-${pad2(todayParts.month)}-${pad2(todayParts.day)}T${pad2(timeParts.hour)}:${pad2(timeParts.minute)}:00+05:00`
    )
    if (isNaN(sendAtDate.getTime())) return null
    if (sendAtDate.getTime() <= Date.now()) {
        const tomorrowParts = pktDateOffsetByDays(1)
        sendAtDate = new Date(
            `${tomorrowParts.year}-${pad2(tomorrowParts.month)}-${pad2(tomorrowParts.day)}T${pad2(timeParts.hour)}:${pad2(timeParts.minute)}:00+05:00`
        )
    }

    const captionParts = second !== undefined ? [second, ...rest] : []
    return { sendAtDate, captionParts }
}

async function handleStatusOneLine(sock, message, chatId, sessionId, argString) {
    const parsed = parseStatusOneLineArgs(argString)
    if (!parsed) {
        return await sock.sendMessage(chatId, { text: STATUS_ONELINE_HELP })
    }

    const { sendAtDate, captionParts } = parsed
    if (sendAtDate.getTime() <= Date.now()) {
        return await sock.sendMessage(chatId, { text: '❌ Ye waqt guzar chuka hai. Aainda ka waqt dein.' })
    }
    const caption = captionParts.join(' ').trim()

    const mediaInfo = getMediaInfo(message.message)
    if (mediaInfo.media && (mediaInfo.type === 'image' || mediaInfo.type === 'video')) {
        const buffer = await downloadMessageMedia(message)
        if (!buffer) {
            return await sock.sendMessage(chatId, { text: '⚠️ Media download nahi ho saki. Dubara try karein.' })
        }
        ensureStatusMediaDir()
        const entry = createStatusEntry(sessionId, sendAtDate)
        const ext = extensionForMimetype(mediaInfo.media.mimetype, mediaInfo.type)
        const filePath = path.join(STATUS_MEDIA_DIR, `${entry.id}.${ext}`)
        try {
            fs.writeFileSync(filePath, buffer)
        } catch (error) {
            console.error('Failed to save status media:', error)
            return await sock.sendMessage(chatId, { text: '⚠️ Media save nahi ho saki. Dubara try karein.' })
        }
        entry.type = mediaInfo.type
        entry.filePath = filePath
        entry.caption = caption
        scheduledStatuses.push(entry)
        saveScheduledStatuses()
        return await sock.sendMessage(chatId, { text: formatStatusConfirmation(entry) })
    }

    const entry = createStatusEntry(sessionId, sendAtDate)
    entry.type = 'text'
    entry.caption = caption
    scheduledStatuses.push(entry)
    saveScheduledStatuses()
    return await sock.sendMessage(chatId, { text: formatStatusConfirmation(entry) })
}

async function handleStatusWizardStep(sock, message, chatId, wizardKey) {
    const state = statusWizards.get(wizardKey)
    if (!state) return

    const rawText = extractText(message.message).trim()

    if (state.step === 'datetime') {
        if (rawText.toLowerCase() === '!cancel') {
            statusWizards.delete(wizardKey)
            return await sock.sendMessage(chatId, { text: '❌ Status schedule cancel kar diya gaya.' })
        }
        const [dateStr, ...timeParts] = rawText.split(/\s+/)
        const timeStr = timeParts.join(' ')
        const sendAtDate = parseFlexibleDateTime(dateStr, timeStr)
        if (!sendAtDate) {
            state.lastPromptAt = Date.now()
            return await sock.sendMessage(chatId, { text: '❌ Samajh nahi aaya. Format: `kal 9am`, `aaj 20:00`, ya `15-08 09:00` (dubara bhejein, ya `!cancel`).' })
        }
        if (sendAtDate.getTime() <= Date.now()) {
            state.lastPromptAt = Date.now()
            return await sock.sendMessage(chatId, { text: '❌ Ye waqt guzar chuka hai. Aainda ka waqt dein.' })
        }
        state.sendAtDate = sendAtDate
        state.step = 'media'
        state.lastPromptAt = Date.now()
        return await sock.sendMessage(chatId, { text: 'Ab media (photo/video) ya sirf text bhejein jo status banega.\n\nCancel karne ke liye `!cancel` likhein.' })
    }

    if (state.step === 'media') {
        if (rawText.toLowerCase() === '!cancel') {
            statusWizards.delete(wizardKey)
            return await sock.sendMessage(chatId, { text: '❌ Status schedule cancel kar diya gaya.' })
        }

        const sessionId = wizardKey.split(':')[0]
        const mediaInfo = getMediaInfo(message.message)

        if (mediaInfo.media && (mediaInfo.type === 'image' || mediaInfo.type === 'video')) {
            const buffer = await downloadMessageMedia(message)
            if (!buffer) {
                state.lastPromptAt = Date.now()
                return await sock.sendMessage(chatId, { text: '⚠️ Media download nahi ho saki. Dubara bhejein.' })
            }
            ensureStatusMediaDir()
            const entry = createStatusEntry(sessionId, state.sendAtDate)
            const ext = extensionForMimetype(mediaInfo.media.mimetype, mediaInfo.type)
            const filePath = path.join(STATUS_MEDIA_DIR, `${entry.id}.${ext}`)
            try {
                fs.writeFileSync(filePath, buffer)
            } catch (error) {
                console.error('Failed to save status media:', error)
                state.lastPromptAt = Date.now()
                return await sock.sendMessage(chatId, { text: '⚠️ Media save nahi ho saki. Dubara try karein.' })
            }
            entry.type = mediaInfo.type
            entry.filePath = filePath
            entry.caption = rawText || ''
            scheduledStatuses.push(entry)
            saveScheduledStatuses()
            statusWizards.delete(wizardKey)
            return await sock.sendMessage(chatId, { text: formatStatusConfirmation(entry) })
        }

        if (rawText) {
            const entry = createStatusEntry(sessionId, state.sendAtDate)
            entry.type = 'text'
            entry.caption = rawText
            scheduledStatuses.push(entry)
            saveScheduledStatuses()
            statusWizards.delete(wizardKey)
            return await sock.sendMessage(chatId, { text: formatStatusConfirmation(entry) })
        }

        state.lastPromptAt = Date.now()
        return await sock.sendMessage(chatId, { text: '❌ Koi photo/video ya text nahi mila. Dubara bhejein (ya `!cancel`).' })
    }
}

async function handleSchedulingCommands(sock, message, sessionId) {
    try {
        const fromMe = Boolean(message.key?.fromMe)
        if (!fromMe) return

        const chatId = message.key?.remoteJid
        if (!chatId) return

        const rawText = extractText(message.message).trim()
        const wizardKey = `${sessionId}:${chatId}`

        if (birthdayWizards.has(wizardKey)) {
            const looksLikeCommand = !getMediaInfo(message.message).media
                && rawText.startsWith('!') && parseCommand(rawText) && rawText.toLowerCase() !== '!cancel'
            if (!looksLikeCommand) {
                await handleBirthdayWizardStep(sock, message, chatId, wizardKey, rawText)
                return
            }
            birthdayWizards.delete(wizardKey) // user moved on to a new command
        }

        if (statusWizards.has(wizardKey)) {
            const isPlainCommandText = !getMediaInfo(message.message).media
                && rawText.startsWith('!') && parseCommand(rawText) && rawText.toLowerCase() !== '!cancel'
            if (!isPlainCommandText) {
                await handleStatusWizardStep(sock, message, chatId, wizardKey)
                return
            }
            statusWizards.delete(wizardKey)
        }

        const command = parseCommand(rawText)
        if (!command) return

        if (command.name === 'help') {
            const sessionState = sessions.get(sessionId)
            const isPrimarySession = Boolean(sessionState?.options?.isPrimary)
            const helpText = HELP_TEXT_SCHEDULING + (isPrimarySession ? HELP_TEXT_PAIRING : '')
            await sock.sendMessage(chatId, { text: helpText })

        } else if (command.name === 'birthday' || command.name === 'schedule') {
            if (!command.arg) {
                const selfJid = getSessionSelfJid(sock)
                if (!selfJid || chatId !== selfJid) {
                    return await sock.sendMessage(chatId, {
                        text: selfChatOnlyMessage('`!birthday` ya `!schedule`', '`!birthday <number> <date> <time> <message>`')
                    })
                }
                birthdayWizards.set(wizardKey, { step: 'target', chatId, lastPromptAt: Date.now() })
                return await sock.sendMessage(chatId, {
                    text: 'Kis number/group ko bhejna hai? (number likhein, ya group JID — `!group` se lein)\n\nKisi bhi waqt `!cancel` likh kar rok saktay hain.'
                })
            }

            // One-line form: !birthday|!schedule <number_or_groupID> <date> <time> <message...>
            // A photo/video can be attached with this text as its caption —
            // message text becomes optional in that case.
            const parts = command.arg.split(/\s+/)
            if (parts.length < 3) {
                return await sock.sendMessage(chatId, { text: BIRTHDAY_ONELINE_HELP })
            }

            const [targetRaw, dateStr, timeStr, ...msgParts] = parts
            const scheduledMessage = msgParts.join(' ').trim()

            const target = resolveTargetJid(targetRaw)
            if (!target) {
                return await sock.sendMessage(chatId, { text: '❌ Number/Group ID ghalat hai.' })
            }

            const sendAtDate = parseFlexibleDateTime(dateStr, timeStr)
            if (!sendAtDate) {
                return await sock.sendMessage(chatId, { text: BIRTHDAY_ONELINE_HELP })
            }

            if (sendAtDate.getTime() <= Date.now()) {
                return await sock.sendMessage(chatId, { text: '❌ Ye waqt guzar chuka hai. Aainda ka date/time dein.' })
            }

            const birthdayMediaInfo = getMediaInfo(message.message)
            if (birthdayMediaInfo.media && (birthdayMediaInfo.type === 'image' || birthdayMediaInfo.type === 'video')) {
                const buffer = await downloadMessageMedia(message)
                if (!buffer) {
                    return await sock.sendMessage(chatId, { text: '⚠️ Media download nahi ho saki. Dubara try karein.' })
                }
                ensureScheduleMediaDir()
                const entry = createScheduleEntry(sessionId, target, sendAtDate)
                const ext = extensionForMimetype(birthdayMediaInfo.media.mimetype, birthdayMediaInfo.type)
                const filePath = path.join(SCHEDULE_MEDIA_DIR, `${entry.id}.${ext}`)
                fs.writeFileSync(filePath, buffer)
                entry.mediaType = birthdayMediaInfo.type
                entry.filePath = filePath
                entry.message = scheduledMessage
                scheduledMessages.push(entry)
                saveScheduledMessages()
                return await sock.sendMessage(chatId, { text: formatScheduledConfirmation(entry) })
            }

            if (!scheduledMessage) {
                return await sock.sendMessage(chatId, { text: '❌ Message likhna zaroori hai (ya photo/video attach karein).' })
            }

            const entry = createScheduleEntry(sessionId, target, sendAtDate)
            entry.message = scheduledMessage
            scheduledMessages.push(entry)
            saveScheduledMessages()

            await sock.sendMessage(chatId, { text: formatScheduledConfirmation(entry) })

        } else if (command.name === 'group') {
            if (!chatId.endsWith('@g.us')) {
                return await sock.sendMessage(chatId, { text: '⚠️ Ye command sirf group ke andar chalti hai (is group ki JID dene ke liye).' })
            }
            await sock.sendMessage(chatId, { text: `📋 Is group ki JID:\n\`${chatId}\`` })

        } else if (command.name === 'groups') {
            try {
                const groups = await sock.groupFetchAllParticipating()
                const entries = Object.values(groups || {})
                if (entries.length === 0) {
                    return await sock.sendMessage(chatId, { text: '📋 Ye session kisi bhi group mein nahi hai.' })
                }
                let listText = '*📋 Groups (copy JID for !birthday):*\n\n'
                entries.forEach((g, index) => {
                    listText += `${index + 1}. ${g.subject}\n   \`${g.id}\`\n\n`
                })
                await sock.sendMessage(chatId, { text: listText })
            } catch (error) {
                console.error('Error fetching groups:', error)
                await sock.sendMessage(chatId, { text: '⚠️ Groups fetch nahi ho sakay.' })
            }

        } else if (command.name === 'scheduledlist') {
            const mine = scheduledMessages.filter((e) => e.sessionId === sessionId && !e.sent)
            if (mine.length === 0) {
                return await sock.sendMessage(chatId, { text: '📋 Koi pending scheduled message nahi hai.' })
            }
            let listText = '*📋 Pending Scheduled Messages:*\n\n'
            let index = 0
            for (const e of mine) {
                index++
                const when = new Date(e.sendAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })
                const targetDisplay = await formatTargetDisplay(sock, e.targetJid, e.targetType)
                listText += `${index}. ID: ${e.id}\n   To: ${targetDisplay}\n   When: ${when} (PKT)\n   Msg: ${e.message}\n\n`
            }
            await sock.sendMessage(chatId, { text: listText })

        } else if (command.name === 'cancelschedule') {
            const id = command.arg.trim()
            if (!id) {
                return await sock.sendMessage(chatId, { text: '❌ ID mention karein. Example: `!cancelschedule sched_123`\nID `!scheduledlist` se milegi.' })
            }
            const index = scheduledMessages.findIndex((e) => e.id === id && e.sessionId === sessionId && !e.sent)
            if (index === -1) {
                return await sock.sendMessage(chatId, { text: '⚠️ Ye ID nahi mili (ya pehle hi bhej di gayi hai).' })
            }
            deleteScheduleMediaFile(scheduledMessages[index].filePath)
            scheduledMessages.splice(index, 1)
            saveScheduledMessages()
            await sock.sendMessage(chatId, { text: `✅ Schedule ${id} cancel kar diya gaya.` })

        } else if (command.name === 'status') {
            if (!command.arg) {
                const selfJid = getSessionSelfJid(sock)
                if (!selfJid || chatId !== selfJid) {
                    return await sock.sendMessage(chatId, {
                        text: selfChatOnlyMessage('`!status`', '`!status <time> <caption>` (media caption ke tor par bhi chalta hai)')
                    })
                }
                statusWizards.set(wizardKey, { step: 'datetime', chatId, lastPromptAt: Date.now() })
                return await sock.sendMessage(chatId, {
                    text: 'Kis waqt status lagana hai? (jaisay: `kal 9am`, `aaj 20:00`, ya `15-08 09:00`)\n\nKisi bhi waqt `!cancel` likh kar rok saktay hain.'
                })
            }

            await handleStatusOneLine(sock, message, chatId, sessionId, command.arg)

        } else if (command.name === 'statuslist') {
            const mine = scheduledStatuses.filter((e) => e.sessionId === sessionId && !e.sent)
            if (mine.length === 0) {
                return await sock.sendMessage(chatId, { text: '📋 Koi pending scheduled status nahi hai.' })
            }
            let listText = '*📋 Pending Scheduled Statuses:*\n\n'
            mine.forEach((e, index) => {
                const when = new Date(e.sendAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })
                listText += `${index + 1}. ID: ${e.id}\n   Type: ${e.type}\n   When: ${when} (PKT)\n${e.caption ? `   Caption: ${e.caption}\n` : ''}\n`
            })
            await sock.sendMessage(chatId, { text: listText })

        } else if (command.name === 'cancelstatus') {
            const id = command.arg.trim()
            if (!id) {
                return await sock.sendMessage(chatId, { text: '❌ ID mention karein. Example: `!cancelstatus sched_123`\nID `!statuslist` se milegi.' })
            }
            const index = scheduledStatuses.findIndex((e) => e.id === id && e.sessionId === sessionId && !e.sent)
            if (index === -1) {
                return await sock.sendMessage(chatId, { text: '⚠️ Ye ID nahi mili (ya pehle hi lag chuki hai).' })
            }
            deleteStatusMediaFile(scheduledStatuses[index].filePath)
            scheduledStatuses.splice(index, 1)
            saveScheduledStatuses()
            await sock.sendMessage(chatId, { text: `✅ Status schedule ${id} cancel kar diya gaya.` })

        } else if (command.name === 'statusaudience') {
            const sessionState = sessions.get(sessionId)
            if (!sessionState) return

            const arg = command.arg.trim()
            if (!arg) {
                const hasCustom = sessionState.statusAudience && sessionState.statusAudience.size > 0
                if (!hasCustom) {
                    return await sock.sendMessage(chatId, {
                        text: '👁️ Abhi koi custom privacy set nahi hai — naya status har us contact ko dikhta hai jo bot ne auto-detect kiya hai.\n\nSirf kuch logon ko dikhane ke liye:\n`!statusaudience 923001234567,923009876543`\n\nWapas sab ko dikhane ke liye:\n`!statusaudience all`'
                    })
                }
                const list = Array.from(sessionState.statusAudience).map((jid) => `+${String(jid).split('@')[0]}`).join('\n')
                return await sock.sendMessage(chatId, {
                    text: `👁️ Abhi naya status SIRF inko dikhta hai:\n${list}\n\nWapas sab ko dikhane ke liye:\n\`!statusaudience all\``
                })
            }

            if (['all', 'clear', 'reset'].includes(arg.toLowerCase())) {
                sessionState.statusAudience = new Set()
                saveStatusAudience(sessionId, sessionState.statusAudience)
                return await sock.sendMessage(chatId, { text: '✅ Privacy hata di gayi — ab naya status sab auto-detected contacts ko dikhega.' })
            }

            const jids = parseRecipientNumbersToJids(arg)
            if (jids.length === 0) {
                return await sock.sendMessage(chatId, { text: '❌ Koi valid number nahi mila. Example: `!statusaudience 923001234567,923009876543`' })
            }
            sessionState.statusAudience = new Set(jids)
            saveStatusAudience(sessionId, sessionState.statusAudience)
            const list = jids.map((jid) => `+${jid.split('@')[0]}`).join('\n')
            await sock.sendMessage(chatId, {
                text: `✅ Privacy set ho gayi — ab har NAYA status sirf inko dikhega:\n${list}\n\n⚠️ Ye sirf AAINDA (ab se banne wale) status par lagu hoga — pehle se lage hue status is se nahi badlenge.\nWapas sab ko dikhane ke liye:\n\`!statusaudience all\``
            })

        } else if (command.name === 'antidelete') {
            const config = loadAntideleteConfig()
            const arg = command.arg.trim().toLowerCase()

            if (!arg) {
                return await sock.sendMessage(chatId, {
                    text: `*🗑️ ANTIDELETE SETUP*\n\nCurrent Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n*Scope:* Sirf Inbox (private chats) — group deletions hamesha ignore hoti hain.\n*Default:* Khud-ba-khud ON hota hai.\n\n*.antidelete on* - Enable\n*.antidelete off* - Disable`
                })
            }

            if (arg === 'on') {
                config.enabled = true
            } else if (arg === 'off') {
                config.enabled = false
            } else {
                return await sock.sendMessage(chatId, { text: '❌ Invalid. `!antidelete on` ya `!antidelete off` likhein.' })
            }

            saveAntideleteConfig(config)
            await sock.sendMessage(chatId, {
                text: `✅ Antidelete ${arg === 'on' ? 'enabled' : 'disabled'} (sirf inbox ke liye — groups hamesha ignore).`
            })

        } else if (command.name === 'postedstatuses') {
            const mine = postedStatuses.filter((e) => e.sessionId === sessionId)
            if (mine.length === 0) {
                return await sock.sendMessage(chatId, { text: '📋 Abhi koi live status nahi hai (ya sab 24 ghante se purane ho kar khud khatam ho gaye).' })
            }
            let listText = '*📋 Live Statuses (delete karne ke liye ID chahiye):*\n\n'
            mine.forEach((e, index) => {
                const when = new Date(e.postedAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })
                listText += `${index + 1}. ID: ${e.id}\n   Type: ${e.type}\n   Posted: ${when} (PKT)\n\n`
            })
            listText += 'Delete karne ke liye: `!deletestatus <ID>`'
            await sock.sendMessage(chatId, { text: listText })

        } else if (command.name === 'deletestatus') {
            const id = command.arg.trim()
            if (!id) {
                return await sock.sendMessage(chatId, { text: '❌ ID mention karein. Example: `!deletestatus sched_123`\nID `!postedstatuses` se milegi.' })
            }
            const index = postedStatuses.findIndex((e) => e.id === id && e.sessionId === sessionId)
            if (index === -1) {
                return await sock.sendMessage(chatId, { text: '⚠️ Ye ID nahi mili (ya status 24 ghante se purana ho kar khud khatam ho chuka hai).' })
            }
            const posted = postedStatuses[index]
            const selfJid = getSessionSelfJid(sock)
            try {
                await sock.sendMessage('status@broadcast', {
                    delete: {
                        remoteJid: 'status@broadcast',
                        id: posted.messageId,
                        fromMe: true,
                        participant: selfJid || undefined,
                    },
                }, {
                    statusJidList: posted.jidList || [],
                    broadcast: true,
                })
                postedStatuses.splice(index, 1)
                savePostedStatuses()
                await sock.sendMessage(chatId, { text: `✅ Status ${id} sab (${(posted.jidList || []).length} log) ke liye delete kar diya gaya.` })
            } catch (error) {
                console.error('Failed to delete status:', error)
                await sock.sendMessage(chatId, { text: '⚠️ Status delete nahi ho saka. Dubara try karein.' })
            }
        }
    } catch (error) {
        console.error('Error in handleSchedulingCommands:', error)
    }
}

async function checkWizardTimeouts() {
    const now = Date.now()

    for (const [wizardKey, state] of [...birthdayWizards.entries()]) {
        if (now - (state.lastPromptAt || 0) <= WIZARD_TIMEOUT_MS) continue
        birthdayWizards.delete(wizardKey)
        const sessionId = wizardKey.split(':')[0]
        const sessionState = sessions.get(sessionId)
        if (sessionState?.sock && state.chatId) {
            await sessionState.sock.sendMessage(state.chatId, {
                text: '⌛ Schedule wizard timeout ho gaya (2 minute tak koi reply nahi mila) — cancel kar diya gaya.\nDubara `!birthday` ya `!schedule` likh kar shuru karein.'
            }).catch(() => {})
        }
    }

    for (const [wizardKey, state] of [...statusWizards.entries()]) {
        if (now - (state.lastPromptAt || 0) <= WIZARD_TIMEOUT_MS) continue
        statusWizards.delete(wizardKey)
        const sessionId = wizardKey.split(':')[0]
        const sessionState = sessions.get(sessionId)
        if (sessionState?.sock && state.chatId) {
            await sessionState.sock.sendMessage(state.chatId, {
                text: '⌛ Status wizard timeout ho gaya (2 minute tak koi reply nahi mila) — cancel kar diya gaya.\nDubara `!status` likh kar shuru karein.'
            }).catch(() => {})
        }
    }
}

function cacheViewOnceIfPresent(message, viewOnceCache) {
    try {
        const chatId = message.key?.remoteJid
        const msgId = message.key?.id
        if (!chatId || !msgId) return
        if (!isViewOnceMessage(message.message)) return

        const mediaInfo = getMediaInfo(message.message)
        if (!mediaInfo.media) return

        const senderJid = message.key.participant || message.key.remoteJid
        viewOnceCache.set(viewOnceCacheKey(chatId, msgId), {
            key: message.key,
            message: message.message,
            senderJid,
        })
    } catch (error) {
        console.error('Error caching view-once message:', error)
    }
}

async function handleViewOnceTrigger(sock, message) {
    try {
        const fromMe = Boolean(message.key?.fromMe)
        const chatId = message.key?.remoteJid
        if (!chatId) return

        const isGroup = chatId.endsWith('@g.us')
        const selfJid = getSessionSelfJid(sock)
        const selfNumber = normalizeNumber(selfJid?.split('@')[0])
        if (!selfJid) return

        let actorJid = ''
        if (fromMe) {
            actorJid = selfJid
        } else if (isGroup) {
            actorJid = message.key.participant || ''
        } else {
            actorJid = chatId
        }

        const actorNumber = normalizeNumber(actorJid.split('@')[0])

        // Only this session's own connected number may trigger a save.
        const isSelfAction = fromMe || (actorNumber && actorNumber === selfNumber)
        if (!isSelfAction) return

        // FIX: normalize the text before checking against TRIGGER_WORDS so
        // trailing punctuation / extra spaces don't cause silent misses.
        const text = normalizeTriggerText(extractText(message.message))
        if (!TRIGGER_WORDS.has(text)) return

        const contextInfo = unwrapMessageContent(message.message)?.extendedTextMessage?.contextInfo
        const quotedMessage = contextInfo?.quotedMessage
        if (!quotedMessage) return

        const senderJid = contextInfo.participant || chatId
        const senderNumber = normalizeNumber(senderJid.split('@')[0])

        const mediaInfo = getMediaInfo(quotedMessage)
        if (!mediaInfo.media) return

        const quotedEnvelope = {
            key: {
                remoteJid: chatId,
                fromMe: false,
                id: contextInfo?.stanzaId,
                participant: senderJid,
            },
            message: quotedMessage,
        }

        const buffer = await downloadMessageMedia(quotedEnvelope)
        if (!buffer) return

        // Always deliver to THIS session's own number — never the global owner.
        await sendMediaToTarget(sock, selfJid, buffer, mediaInfo, {
            caption: `*View-Once Saved* (${text})\n*From:* @${senderNumber}`,
            mentions: [senderJid],
        })
    } catch (error) {
        console.error('Error in handleViewOnceTrigger:', error)
    }
}

async function handleViewOnceReaction(sock, item, viewOnceCache) {
    try {
        const targetKey = item?.key
        const reaction = item?.reaction
        if (!targetKey?.remoteJid || !targetKey?.id) return

        // Empty reaction text means the person REMOVED their reaction — ignore.
        if (!reaction?.text) return

        const selfJid = getSessionSelfJid(sock)
        const selfNumber = normalizeNumber(selfJid?.split('@')[0])
        if (!selfJid) return

        const reactorFromMe = Boolean(reaction.key?.fromMe)
        const reactorJid = reaction.key?.participant || reaction.key?.remoteJid || ''
        const reactorNumber = normalizeNumber(reactorJid.split('@')[0])
        const isSelfAction = reactorFromMe || (reactorNumber && reactorNumber === selfNumber)
        if (!isSelfAction) return

        const cached = viewOnceCache.get(viewOnceCacheKey(targetKey.remoteJid, targetKey.id))
        if (!cached) return // expired from cache, or wasn't a view-once message

        const mediaInfo = getMediaInfo(cached.message)
        if (!mediaInfo.media) return

        const buffer = await downloadMessageMedia({ key: cached.key, message: cached.message })
        if (!buffer) return

        const senderNumber = normalizeNumber(String(cached.senderJid || '').split('@')[0])

        await sendMediaToTarget(sock, selfJid, buffer, mediaInfo, {
            caption: `*View-Once Saved* (reacted ${reaction.text})\n*From:* @${senderNumber}`,
            mentions: cached.senderJid ? [cached.senderJid] : undefined,
        })
    } catch (error) {
        console.error('Error in handleViewOnceReaction:', error)
    }
}

// ---------------------------------------------------------------------------
// Multi-Session Bot Engine
// ---------------------------------------------------------------------------

const sessions = new Map()

const pairingCodeSentFor = new Set()

function closeSession(sessionId) {
    const sessionState = sessions.get(sessionId)
    if (!sessionState?.sock) return
    try { sessionState.sock.ev?.removeAllListeners?.() } catch {}
    try { sessionState.sock.ws?.close?.() } catch {}
    sessionState.sock = null
}

async function safeRestartSession(sessionId, reason) {
    const sessionState = sessions.get(sessionId)
    const options = sessionState?.options
    if (!options) {
        console.error(`[${sessionId}] Cannot restart — no stored options for this session.`)
        return
    }

    if (sessionState.restartPromise) return sessionState.restartPromise

    sessionState.restartPromise = (async () => {
        try {
            const retryCount = sessionState.retryCount || 0
            const delayTime = Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS)
            sessionState.retryCount = retryCount + 1
            console.log(chalk.yellow(`[${sessionId}] Restarting bot engine in ${delayTime}ms: ${reason} (attempt ${sessionState.retryCount})`))
            await delay(delayTime)
            await startSession(sessionId, options)
        } finally {
            const current = sessions.get(sessionId)
            if (current) current.restartPromise = null
        }
    })()
    return sessionState.restartPromise
}

async function startSession(sessionId, options) {

    const existingBeforeStart = sessions.get(sessionId) || { retryCount: 0 }
    sessions.set(sessionId, { ...existingBeforeStart, options })

    try {
        closeSession(sessionId)
        ensureDirectories()

        const { version } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(options.authFolder)
        const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 120 })
        const viewOnceCache = new NodeCache({ stdTTL: 900, checkperiod: 120 })
        const processedMessageIds = new NodeCache({ stdTTL: 120, checkperiod: 30 })

        const { authFolder, isPrimary = false, pairNumber = null, notifyChatId = null, notifySock = null } = options

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'),
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            getMessage: async () => { return '' },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        const existing = sessions.get(sessionId) || { retryCount: 0 }
        const sessionState = {
            ...existing,
            sock,
            options,
            msgRetryCounterCache,
            viewOnceCache,
            processedMessageIds,
            statusRecipients: existing.statusRecipients || loadStatusRecipients(sessionId),
            statusAudience: existing.statusAudience || loadStatusAudience(sessionId),
            lastActivityAt: Date.now(),
            connectionState: 'starting',
            restartPromise: null,
        }
        sessions.set(sessionId, sessionState)

        sock.ev.on('creds.update', saveCreds)

        // Keep the status-recipient list topped up from WhatsApp's own
        // contact sync, so posting a status actually has someone to deliver to.
        sock.ev.on('contacts.upsert', (contacts) => {
            for (const c of contacts || []) addStatusRecipient(sessionId, sessionState, c?.id)
        })
        sock.ev.on('contacts.update', (updates) => {
            for (const c of updates || []) addStatusRecipient(sessionId, sessionState, c?.id)
        })

        sock.ev.on('messages.upsert', async (chatUpdate) => {
            try {
                sessionState.lastActivityAt = Date.now()
                const message = chatUpdate.messages?.[0]
                if (!message?.message) return
                if (message.key?.remoteJid === 'status@broadcast') return

                const dedupeId = message.key?.id
                if (dedupeId) {
                    if (processedMessageIds.get(dedupeId)) return
                    processedMessageIds.set(dedupeId, true)
                }

                cacheViewOnceIfPresent(message, viewOnceCache)

                const isRevocation = message.message?.protocolMessage?.type === 0
                    || message.message?.protocolMessage?.type === 'REVOKE'
                if (isRevocation) {
                    await handleMessageRevocationForAntidelete(sock, message, sessionId)
                } else {
                    await storeMessageForAntidelete(message, sessionId)
                }

                const msgChatId = message.key?.remoteJid
                if (msgChatId?.endsWith('@s.whatsapp.net')) {
                    addStatusRecipient(sessionId, sessionState, msgChatId)
                } else if (msgChatId?.endsWith('@g.us') && message.key?.participant) {
                    addStatusRecipient(sessionId, sessionState, message.key.participant)
                }

                if (isPrimary) {
                    await handleCommands(sock, message)
                }
                await handleSchedulingCommands(sock, message, sessionId)
                await handleViewOnceTrigger(sock, message)
            } catch (err) {
                console.error(`[${sessionId}] Error processing message:`, err)
            }
        })

        sock.ev.on('messages.reaction', async (reactions) => {
            try {
                sessionState.lastActivityAt = Date.now()
                for (const item of reactions || []) {
                    await handleViewOnceReaction(sock, item, viewOnceCache)
                }
            } catch (err) {
                console.error(`[${sessionId}] Error processing reaction:`, err)
            }
        })

        sock.decodeJid = (jid) => {
            if (!jid) return jid
            if (/:\d+@/gi.test(jid)) {
                const decode = jidDecode(jid) || {}
                return decode.user && decode.server ? `${decode.user}@${decode.server}` : jid
            }
            return jid
        }

        if (pairingCode && pairNumber && !sock.authState.creds.registered && !pairingCodeSentFor.has(sessionId)) {
            pairingCodeSentFor.add(sessionId)
            setTimeout(async () => {
                try {
                    console.log(chalk.cyan(`\n🔑 [${sessionId}] Requesting Pairing Code for +${pairNumber}...`))
                    let code = await sock.requestPairingCode(pairNumber)
                    code = code?.match(/.{1,4}/g)?.join('-') || code
                    console.log(chalk.black(chalk.bgGreen(`\n🚀 PAIRING CODE (+${pairNumber}): `)), chalk.bold.white.bgBlue(` ${code} `), '\n')

                    if (notifySock && notifyChatId) {
                        await notifySock.sendMessage(notifyChatId, {
                            text: `🔒 *Secure Pairing Code:* ${code}\n\n📱 +${pairNumber} par WhatsApp kholein > *Linked Devices* > *Link with phone number*, phir yeh code enter karein.\n⏳ Ye code sirf ~60 second ke liye valid hai — turant enter karein, warna "wrong code" error aayega aur aapko dobara !pair karna hoga.`
                        }).catch(() => {})
                    }
                } catch (error) {
                    console.error(`[${sessionId}] Error requesting pairing code:`, error)
                    // Request genuinely failed (no code was ever sent) — allow a
                    // retry on the next reconnect instead of permanently blocking.
                    pairingCodeSentFor.delete(sessionId)
                    if (notifySock && notifyChatId) {
                        await notifySock.sendMessage(notifyChatId, {
                            text: `⚠️ +${pairNumber} ke liye pairing code generate nahi ho saka. Dobara try karein.`
                        }).catch(() => {})
                    }
                }
            }, 3000)
        }

        sock.ev.on('connection.update', async (s) => {
            const { connection, lastDisconnect } = s
            sessionState.lastActivityAt = Date.now()
            if (connection) sessionState.connectionState = connection

            if (connection === 'connecting') {
                console.log(chalk.yellow(`⏳ [${sessionId}] Connecting to WhatsApp Core Network...`))
            }

            if (connection === 'open') {
                sessionState.retryCount = 0
                pairingCodeSentFor.delete(sessionId) // pairing done (or wasn't needed) — safe to allow a future request
                console.log(chalk.green.bold(`\n✅ [${sessionId}] Connected successfully`))
                const selfJidForLog = getSessionSelfJid(sock)
                console.log(chalk.cyan(`   ↳ Detected self JID: ${selfJidForLog || 'UNKNOWN (sock.user.id missing)'} | Known status recipients: ${sessionState.statusRecipients?.size || 0}`))
                if (isPrimary) {
                    console.log(chalk.green(`👤 Operational Owner: ${global.ownername}\n`))
                } else if (pairNumber) {
                    if (!pairedNumbers.has(pairNumber)) {
                        pairedNumbers.add(pairNumber)
                        savePairedNumbers()
                    }
                    if (notifySock && notifyChatId) {
                        await notifySock.sendMessage(notifyChatId, {
                            text: `✅ Number +${pairNumber} successfully link ho gaya hai! Ab yeh apna independent bot session chala raha hai. 🎉`
                        }).catch(() => {})
                    }
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut

                console.log(chalk.red(`⚠️ [${sessionId}] Connection closed. Reconnecting state: ${shouldReconnect}`))
                if (!shouldReconnect) {
                    console.error(chalk.red.bold(`❌ [${sessionId}] Session Invalidated. Please pair again.`))
                    if (!isPrimary && pairNumber) {
                        pairedNumbers.delete(pairNumber)
                        savePairedNumbers()
                    }
                    sessions.delete(sessionId)
                    return
                }

                await safeRestartSession(sessionId, `connection closed (${statusCode || 'unknown'})`)
            }
        })

        return sock
    } catch (error) {
        console.error(`[${sessionId}] Fatal bot error:`, error)
        await safeRestartSession(sessionId, 'fatal startup error')
        return null
    }
}

// ---------------------------------------------------------------------------
// 🧹 AUTO-CLEAR — periodic RAM housekeeping
// ---------------------------------------------------------------------------
const AUTO_CLEAR_INTERVAL_MS = settings.autoClearInterval || 30 * 60 * 1000

function formatMB(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function runAutoClear() {
    try {
        let clearedCaches = 0
        for (const [, sessionState] of sessions) {
            if (sessionState.msgRetryCounterCache) {
                sessionState.msgRetryCounterCache.flushAll()
                clearedCaches++
            }
        }

        let gcRan = false
        if (typeof global.gc === 'function') {
            global.gc()
            gcRan = true
        }

        const mem = process.memoryUsage()
        console.log(chalk.magenta(
            `🧹 [AUTO-CLEAR] sessions=${sessions.size} cachesFlushed=${clearedCaches} gc=${gcRan ? 'yes' : 'skip(run with --expose-gc to enable)'} ` +
            `RSS=${formatMB(mem.rss)} heapUsed=${formatMB(mem.heapUsed)} heapTotal=${formatMB(mem.heapTotal)}`
        ))
    } catch (error) {
        console.error('⚠️ [AUTO-CLEAR] Failed:', error.message)
    }
}

// ---------------------------------------------------------------------------
// 🎂 SCHEDULER — sends !birthday/!schedule-scheduled messages at their due time
// ---------------------------------------------------------------------------
const SCHEDULE_MISSED_GRACE_MS = 6 * 60 * 60 * 1000 // 6 hours

async function checkScheduledMessages() {
    const now = Date.now()
    let changed = false

    for (const entry of scheduledMessages) {
        if (entry.sent) continue

        const dueAt = new Date(entry.sendAt).getTime()
        if (isNaN(dueAt) || dueAt > now) continue

        const overdueMs = now - dueAt

        if (overdueMs > SCHEDULE_MISSED_GRACE_MS) {
            entry.sent = true
            entry.skipped = true
            changed = true
            deleteScheduleMediaFile(entry.filePath)
            console.log(chalk.yellow(`🎂 [SCHEDULER] Skipped overdue message ${entry.id} (missed by ${Math.round(overdueMs / 60000)} min)`))
            continue
        }

        const sessionState = sessions.get(entry.sessionId)
        if (!sessionState?.sock || sessionState.connectionState !== 'open') {
            continue
        }

        try {
            if (entry.mediaType && entry.filePath && fs.existsSync(entry.filePath)) {
                const buffer = fs.readFileSync(entry.filePath)
                const payload = entry.mediaType === 'video'
                    ? { video: buffer, caption: entry.message || '' }
                    : { image: buffer, caption: entry.message || '' }
                await sessionState.sock.sendMessage(entry.targetJid, payload)
            } else {
                await sessionState.sock.sendMessage(entry.targetJid, { text: entry.message })
            }
            entry.sent = true
            changed = true
            deleteScheduleMediaFile(entry.filePath)
            console.log(chalk.green(`🎂 [SCHEDULER] Sent scheduled ${entry.mediaType || 'text'} message ${entry.id} to ${entry.targetJid}`))
        } catch (error) {
            console.error(`🎂 [SCHEDULER] Failed to send ${entry.id}:`, error?.message || error)
        }
    }

    if (changed) {
        scheduledMessages = scheduledMessages.filter((e) => {
            if (!e.sent) return true
            return now - new Date(e.sendAt).getTime() < 24 * 60 * 60 * 1000
        })
        saveScheduledMessages()
    }
}

// ---------------------------------------------------------------------------
// 📸 STATUS SCHEDULER — sends !status-scheduled WhatsApp statuses
// ---------------------------------------------------------------------------
async function checkScheduledStatuses() {
    const now = Date.now()
    let changed = false

    for (const entry of scheduledStatuses) {
        if (entry.sent) continue

        const dueAt = new Date(entry.sendAt).getTime()
        if (isNaN(dueAt) || dueAt > now) continue

        const overdueMs = now - dueAt

        if (overdueMs > SCHEDULE_MISSED_GRACE_MS) {
            entry.sent = true
            entry.skipped = true
            changed = true
            deleteStatusMediaFile(entry.filePath)
            console.log(chalk.yellow(`📸 [STATUS] Skipped overdue status ${entry.id} (missed by ${Math.round(overdueMs / 60000)} min)`))
            const skippedSessionState = sessions.get(entry.sessionId)
            const skippedSelfJid = skippedSessionState?.sock ? getSessionSelfJid(skippedSessionState.sock) : null
            if (skippedSelfJid) {
                await skippedSessionState.sock.sendMessage(skippedSelfJid, {
                    text: `⚠️ Status miss ho gaya (ID: ${entry.id})\nSchedule time: ${new Date(entry.sendAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} (PKT)\n\nWajah: bot ${Math.round(overdueMs / 60000)} minute tak (6 ghante ki limit se zyada) connect nahi ho saka — is liye late post nahi kiya gaya. Agla waqt zyada qareeb rakhein, aur bot online rehna chahiye us waqt.`
                }).catch(() => {})
            }
            continue
        }

        const sessionState = sessions.get(entry.sessionId)
        if (!sessionState?.sock || sessionState.connectionState !== 'open') {
            continue
        }

        try {
            const statusJidList = getEffectiveStatusJidList(entry.sessionId, sessionState)
            const usingCustomAudience = Boolean(sessionState.statusAudience && sessionState.statusAudience.size > 0)

            console.log(chalk.cyan(`📸 [STATUS] Posting ${entry.id} to ${statusJidList.length} recipient(s)${usingCustomAudience ? ' (custom audience)' : ''}: ${statusJidList.join(', ') || 'none'}`))

            if (statusJidList.length === 0) {
                console.log(chalk.yellow(`📸 [STATUS] Warning: no known contacts for ${entry.sessionId} yet — status may not be visible to anyone. Chat with at least one contact first, or wait for contact sync.`))
            }

            let sendResult
            if (entry.type === 'text') {
                sendResult = await postStatusUpdate(
                    sessionState.sock,
                    { text: entry.caption || '' },
                    statusJidList,
                    { backgroundColor: '#000000' }
                )
            } else {
                if (!entry.filePath || !fs.existsSync(entry.filePath)) {
                    throw new Error('Saved media file missing on disk')
                }
                const buffer = fs.readFileSync(entry.filePath)
                const payload = entry.type === 'video'
                    ? { video: buffer, caption: entry.caption || '' }
                    : { image: buffer, caption: entry.caption || '' }
                sendResult = await postStatusUpdate(sessionState.sock, payload, statusJidList)
            }
            entry.sent = true
            changed = true
            deleteStatusMediaFile(entry.filePath)
            if (sendResult?.key?.id) {
                postedStatuses.push({
                    id: entry.id,
                    sessionId: entry.sessionId,
                    messageId: sendResult.key.id,
                    type: entry.type,
                    postedAt: new Date().toISOString(),
                    jidList: statusJidList,
                })
                savePostedStatuses()
            }

            console.log(chalk.green(`📸 [STATUS] Posted scheduled status ${entry.id} (${entry.type})`))

            const selfJid = getSessionSelfJid(sessionState.sock)
            if (selfJid) {
                await sessionState.sock.sendMessage(selfJid, {
                    text: `✅ Status lag gaya! (ID: ${entry.id}, ${entry.type})\n👥 ${statusJidList.length} log dekh sakte hain.`
                }).catch(() => {})
            }
        } catch (error) {
            const errorMessage = error?.message || String(error)
            console.error(`📸 [STATUS] Failed to post ${entry.id}:`, errorMessage)
            changed = true
            if (!entry.errorNotified) {
                entry.errorNotified = true
                const selfJid = getSessionSelfJid(sessionState.sock)
                if (selfJid) {
                    await sessionState.sock.sendMessage(selfJid, {
                        text: `⚠️ Status post karne mein masla aaya (ID: ${entry.id}):\n${errorMessage}\n\nBot dubara try karta rahega (agle 30 second baad, 6 ghante tak) — agar masla khatam nahi hota to media dubara chhota/kam size mein bhej kar dekhein, ya "!cancelstatus ${entry.id}" se cancel kar ke dobara schedule karein.`
                    }).catch(() => {})
                }
            }
        }
    }

    if (changed) {
        scheduledStatuses = scheduledStatuses.filter((e) => {
            if (!e.sent) return true
            return now - new Date(e.sendAt).getTime() < 24 * 60 * 60 * 1000
        })
        saveScheduledStatuses()
    }

    prunePostedStatuses()
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
loadPairedNumbers()
loadScheduledMessages()
loadScheduledStatuses()
loadPostedStatuses()

safeInterval('watchdog', async () => {
    const watchdogMs = settings.watchdogInterval || 60 * 1000
    for (const [sessionId, sessionState] of sessions) {
        const staleForMs = Date.now() - (sessionState.lastActivityAt || 0)
        if (sessionState.connectionState !== 'open' && staleForMs > watchdogMs * 2) {
            await safeRestartSession(sessionId, `watchdog stale state ${sessionState.connectionState}`)
        }
    }
}, settings.watchdogInterval || 60 * 1000)

safeInterval('autoclear', runAutoClear, AUTO_CLEAR_INTERVAL_MS)

// FIX: cleanup now walks each SESSION's own antidelete-media subfolder and
// applies the 200MB cap per-session, instead of treating the whole
// antidelete-media directory as one shared pool. Previously a single busy
// paired number could blow through the shared 200MB cap and wipe out other
// sessions' not-yet-recovered media too.
safeInterval('antidelete-cleanup', () => {
    try {
        if (!fs.existsSync(ANTIDELETE_MEDIA_DIR)) return
        for (const entry of fs.readdirSync(ANTIDELETE_MEDIA_DIR)) {
            const sessionMediaDir = path.join(ANTIDELETE_MEDIA_DIR, entry)
            try {
                if (fs.statSync(sessionMediaDir).isDirectory()) {
                    cleanFolderIfLarge(sessionMediaDir, 200) // 200MB quota PER session
                }
            } catch (innerErr) {
                console.error(`Antidelete cleanup error for ${entry}:`, innerErr)
            }
        }
    } catch (err) {
        console.error('Antidelete cleanup error:', err)
    }
}, 60 * 1000)

safeInterval('scheduler', checkScheduledMessages, 30 * 1000)
safeInterval('status-scheduler', checkScheduledStatuses, 30 * 1000)
safeInterval('wizard-timeout', checkWizardTimeouts, 30 * 1000)

if (!phoneNumber) {
    console.log(chalk.red.bold('\n❌ ERROR: Owner number missing!\n'))
}
startSession('main', {
    authFolder: path.join(DATA_DIR, 'session'),
    isPrimary: true,
    pairNumber: phoneNumber || null,
}).catch((error) => {
    console.error('Unhandled startup failure:', error)
    safeRestartSession('main', 'unhandled startup failure')
})

for (const number of pairedNumbers) {
    const sessionId = `paired-${number}`
    startSession(sessionId, {
        authFolder: path.join(SESSIONS_DIR, number),
        isPrimary: false,
        pairNumber: number,
    }).catch((error) => {
        console.error(`Unhandled startup failure for paired session ${sessionId}:`, error)
    })
}

process.on('uncaughtException', (error) => { console.error('uncaughtException:', error) })
process.on('unhandledRejection', (error) => { console.error('unhandledRejection:', error) })

// ---------------------------------------------------------------------------
// 🌐 Keep-Alive Web Server for Cloud Hosting (Railway / Koyeb)
// ---------------------------------------------------------------------------
const express = require('express')
const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => {
    res.send('🚀 WhatsApp Bot Server is Live and Running 24/7!')
})

app.listen(PORT, () => {
    console.log(chalk.green.bold(`\n🌐 Keep-Alive Server listening on port: ${PORT}`))
})
