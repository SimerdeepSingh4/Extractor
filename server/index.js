/* ============================================================
   PARSER v7.1 — FULL SERVER
   - PDF support: pdf-parse (typed) + pdf-poppler render + OCR (scanned)
   - CRASH GUARD: PDF buffer never reaches Tesseract
   - uncaughtException guard: server never dies
============================================================ */
console.log('[PARSER] v7.2 loaded — persistent OCR worker + speed optimizations');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');


const fs = require('fs');
const path = require('path');

const Tesseract = require('tesseract.js');
const sharp = require('sharp');
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (_) { pdfParse = null; }
let pdfPoppler = null;
try { pdfPoppler = require('pdf-poppler'); } catch (_) { pdfPoppler = null; }
let pdfToImg = null;
try { pdfToImg = require('pdf-to-img'); } catch (_) { pdfToImg = null; }

console.log(`[OCR] PDF engines — pdf-parse: ${!!pdfParse} | pdf-poppler: ${!!pdfPoppler} | pdf-to-img: ${!!pdfToImg}`);

/* =========================================================
   PERSISTENT TESSERACT WORKER — ek baar warm-up, baar-baar reuse
   Har request pe naya worker banana = 1-3 sec extra delay
========================================================= */
let _ocrWorker = null;
let _workerBusy = false;
const _workerQueue = [];

async function getOcrWorker() {
    if (!_ocrWorker) {
        console.log('[OCR] Initializing persistent Tesseract worker...');
        _ocrWorker = await Tesseract.createWorker('eng', 1, {
            logger: () => { }, // silence internal logs
        });
        console.log('[OCR] Persistent Tesseract worker ready.');
    }
    return _ocrWorker;
}

/* Queue-based OCR — worker ek time pe ek kaam karta hai */
async function workerOcr(input) {
    return new Promise((resolve, reject) => {
        _workerQueue.push({ input, resolve, reject });
        processWorkerQueue();
    });
}

async function processWorkerQueue() {
    if (_workerBusy || !_workerQueue.length) return;
    _workerBusy = true;
    const { input, resolve, reject } = _workerQueue.shift();
    try {
        const worker = await getOcrWorker();
        const { data } = await worker.recognize(input);
        resolve(data || { text: '' });
    } catch (e) {
        reject(e);
    } finally {
        _workerBusy = false;
        processWorkerQueue(); // next item
    }
}

// Server start pe worker warm up karo (background mein)
setTimeout(() => getOcrWorker().catch(e => console.warn('[OCR] Worker warm-up failed:', e.message)), 500);

const app = express();
app.use(cors());
app.use(express.json());
// Serve client static files (HTML, JS, CSS) from the client directory
app.use(express.static(path.join(__dirname, '..', 'client'), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// Upload directory for OCR images
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR));
const upload = multer({ dest: UPLOAD_DIR });
const { processDocument } = require('./idp');
const { ENABLE_IDP, ENABLE_OCR_PREPROCESS, OCR_PREPROCESS_OPTIONS, FORCE_OCR_FOR_PDF } = require('./config/idp.config');

/* =========================================================
   ★ CRASH GUARDS — PDF buffer kabhi Tesseract tak nahi jayega
========================================================= */
const PDF_MAGIC = Buffer.from('%PDF');
function isPdfFile(filePath) {
    try {
        const head = fs.readFileSync(filePath).slice(0, 5);
        return head.equals(PDF_MAGIC);
    } catch { return false; }
}
function isPdfBuffer(buf) {
    try { return Buffer.isBuffer(buf) && buf.slice(0, 5).equals(PDF_MAGIC); } catch { return false; }
}

/* Har Tesseract call is wrapper se jayegi — fail ho to '' milega, crash nahi */
async function preprocessImage(buffer, options = {}) {
    try {
        let pipeline = sharp(buffer);
        const meta = await pipeline.metadata();

        // Auto-orient based on EXIF, flatten alpha channel, and convert to grayscale
        pipeline = pipeline.rotate().flatten({ background: '#ffffff' }).greyscale();

        // Enhance contrast (linear formula: a * pixel + b) and normalize
        pipeline = pipeline.linear(1.2, -10).normalize();

        // Upscale small images for better OCR accuracy (1400px — good tradeoff)
        if (options.resize) {
            pipeline = pipeline.resize(options.resize);
        } else if (meta.width && meta.width < 1200) {
            pipeline = pipeline.resize({ width: 1400, withoutEnlargement: false });
        }

        // Noise removal / Sharpening
        if (options.median) {
            pipeline = pipeline.median(options.median);
        }
        pipeline = pipeline.sharpen({ sigma: 1.2 });

        if (options.threshold) {
            pipeline = pipeline.threshold(typeof options.threshold === 'number' ? options.threshold : 128);
        }

        return await pipeline.png().toBuffer();
    } catch (e) {
        console.warn('[OCR] Image preprocessing failed:', e.message);
        return buffer; // fallback
    }
}

async function safeOcr(input, opts = {}) {
    try {
        if (isPdfBuffer(input)) {
            console.warn('[OCR] BLOCKED: PDF buffer Tesseract ko nahi ja sakta');
            return { text: '' };
        }
        // Persistent worker use karo (faster), logger opts ke saath fallback
        if (opts.logger) {
            // logger ke saath old path (progress reporting ke liye)
            const { data } = await Tesseract.recognize(input, 'eng', opts);
            return data || { text: '' };
        }
        const data = await workerOcr(input);
        return data || { text: '' };
    } catch (e) {
        console.warn('[OCR] Tesseract failed safely:', e.message);
        return { text: '' };
    }
}

/* Last-resort: worker error aaye to server zinda rahe */
process.on('uncaughtException', (err) => {
    console.error('[FATAL-GUARD] uncaughtException caught, server alive:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('[FATAL-GUARD] unhandledRejection caught, server alive:', err && err.message ? err.message : err);
});

/* =========================================================
   DATE HELPERS
========================================================= */
const MONTHS = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
    IAN: '01', JAH: '01', '0CT': '10', N0V: '11', GEC: '12', DEG: '12', DEO: '12',
    STY: '01', LUT: '02', KWI: '04', MAJ: '05', CZE: '06', LIP: '07',
    SIE: '08', WRZ: '09', PAZ: '10', LIS: '11', GRU: '12',
    FEV: '02', AVR: '04', MAI: '05', JUIL: '07', AOUT: '08', SEPT: '09',
    ENE: '01', ABR: '04', AGO: '08', DIC: '12', DEZ: '12', OKT: '10'
};
const DATE_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})|(\d{1,2}\s+[A-Z]{3,9}(?:\s*\/\s*[A-Z]{3,9})?\s+\d{2,4})|(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})|([A-Z]{3,9}\s+\d{1,2},?\s+\d{2,4})|(\d{1,2}[\/\-.]\d{4})|(\b\d{1,2}\s+[A-Z]{2,}\s+\d{4}\b)/gi;

function monthOf(w) { return MONTHS[String(w).slice(0, 3).toUpperCase()] || ''; }

function iso(y, m, d) {
    y = String(y); m = String(m).padStart(2, '0'); d = String(d).padStart(2, '0');
    if (+m < 1 || +m > 12 || +d < 1 || +d > 31) return '';
    return isNaN(new Date(`${y}-${m}-${d}T00:00:00Z`).getTime()) ? '' : `${y}-${m}-${d}`;
}

function toISO(s) {
    if (!s) return '';
    s = String(s).trim().toUpperCase();
    s = s.replace(/(\d),(?=\d)/g, '$1.');      // "01,01.2013" -> "01.01.2013"
    s = s.replace(/[.'`]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/([A-Z]{3,9})\s*\/\s*[A-Z]{3,9}/g, '$1');
    let m;
    if ((m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/))) return iso(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{1,2})\s*([A-Z]{3,9})\s*,?\s*(\d{2,4})$/))) {
        const mo = monthOf(m[2]);
        if (!mo) return '';
        let y = m[3]; if (y.length === 2) y = +y > 40 ? '19' + y : '20' + y;
        return iso(y, mo, m[1]);
    }
    if ((m = s.match(/^([A-Z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/))) {
        const mo = monthOf(m[1]);
        if (!mo) return '';
        let y = m[3]; if (y.length === 2) y = +y > 40 ? '19' + y : '20' + y;
        return iso(y, mo, m[2]);
    }
    if ((m = s.match(/^(\d{1,2})[\/\-. ]([A-Z]{3,9})[\/\-. ]?(\d{2,4})$/))) {
        const mo = monthOf(m[2]); if (!mo) return '';
        let y = m[3]; if (y.length === 2) y = +y > 40 ? '19' + y : '20' + y;
        return iso(y, mo, m[1]);
    }
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) {
        let d = +m[1], mo = +m[2], y = m[3];
        if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
        if (y.length === 2) y = +y > 40 ? '19' + y : '20' + y;
        return iso(y, String(mo), String(d));
    }
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/))) {
        return iso(m[2], m[1], '01');
    }
    return '';
}

function firstDateIn(line) {
    DATE_RE.lastIndex = 0;
    const m = DATE_RE.exec(String(line).toUpperCase());
    return m ? toISO(m[0]) : '';
}

function dateAfterLabel(line, labelRe) {
    const up = String(line).toUpperCase();
    const m = up.match(labelRe);
    if (!m || m.index == null) return '';
    return firstDateIn(up.slice(m.index + m[0].length));
}

function titleCase(s) { return String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()); }

function mergeFill(target, src) {
    if (!src) return target;
    for (const k of Object.keys(target)) {
        if ((target[k] === '' || target[k] == null) && src[k] != null && String(src[k]).trim() !== '') {
            target[k] = String(src[k]).trim();
        }
    }
    return target;
}

/* =========================================================
   COUNTRY CODES
========================================================= */
const ISO3 = new Set(('ABW AFG AGO AIA ALA ALB AND ARE ARG ARM ASM ATA ATF ATG AUS AUT AZE BDI BEL BEN BES BFA BGD BGR BHR BHS BIH BLM BLR BLZ BMU BOL BRA BRB BRN BTN BVT BWA CAF CAN CCK CHE CHL CHN CIV CMR COD COG COK COL COM CPV CRI CUB CUW CXR CYM CZE DEU DJI DMA DNK DOM DZA ECU EGY ERI ESH ESP EST ETH FIN FJI FLK FRO FSM GAB GBR GEO GGY GHA GIB GIN GLP GMB GNB GNQ GRC GRD GRL GTM GUF GUM GUY HKG HMD HND HRV HTI HUN IDN IMN IND IOT IRL IRN IRQ ISL ISR ITA JAM JEY JOR JPN KAZ KEN KGZ KHM KIR KNA KOR KWT LAO LBN LBR LBY LCA LIE LKA LSO LTU LUX LVA MAC MAF MAR MCO MDA MDG MDV MEX MHL MKD MLI MLT MMR MNE MNG MNP MOZ MRT MSR MTQ MUS MWI MYS MYT NAM NCL NER NFK NGA NIC NIU NLD NOR NPL NRU NZL OMN PAK PAN PCN PER PHL PLW PNG POL PRI PRK PRT PRY PSE PYF QAT REU ROU RUS RWA SAU SDN SEN SGP SGS SHN SLB SLE SLV SMR SOM SPM SRB SSD STP SUR SVK SVN SWE SWZ SXM SYC SYR TCA TCD TGO THA TJK TKL TKM TLS TON TTO TUN TUR TUV TWN TZA UGA UKR UMI URY UZB VAT VCT VEN VGB VIR VNM VUT WLF WSM YEM ZAF ZMB ZWE').split(/\s+/));

function fixCountry(code) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c || !/[0-9]/.test(c)) return '';
    const subs = { '0': ['O', 'D'], '1': ['I', 'L'], '8': ['B'], '5': ['S'], '6': ['G'], '2': ['Z'] };
    const results = new Set();
    const rec = (i, acc) => {
        if (i === c.length) { if (ISO3.has(acc)) results.add(acc); return; }
        rec(i + 1, acc + c[i]);
        if (subs[c[i]]) for (const s of subs[c[i]]) rec(i + 1, acc + s);
    };
    rec(0, '');
    return results.size === 1 ? [...results][0] : '';
}

function mrzCountry(raw) {
    const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!c || c.length !== 3) return '';
    if (/^[A-Z]{3}$/.test(c)) return c;
    const isoFix = fixCountry(c);
    if (isoFix) return isoFix;
    const map = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G', '2': 'Z' };
    const alpha = [...c].map(ch => map[ch] || ch).join('');
    if (/^[A-Z]{3}$/.test(alpha)) return alpha;
    return c;
}

const COUNTRY_TO_ISO3 = {
    INDIA: 'IND', BHARAT: 'IND', INDIAN: 'IND', 'UNITED STATES': 'USA', AMERICA: 'USA', AMERICAN: 'USA',
    'UNITED KINGDOM': 'GBR', BRITAIN: 'GBR', BRITISH: 'GBR', ENGLAND: 'GBR',
    CANADA: 'CAN', CANADIAN: 'CAN', AUSTRALIA: 'AUS', AUSTRALIAN: 'AUS', 'NEW ZEALAND': 'NZL',
    PAKISTAN: 'PAK', BANGLADESH: 'BGD', NEPAL: 'NPL', 'SRI LANKA': 'LKA', AFGHANISTAN: 'AFG',
    CHINA: 'CHN', CHINESE: 'CHN', JAPAN: 'JPN', JAPANESE: 'JPN', KOREA: 'KOR',
    FRANCE: 'FRA', FRENCH: 'FRA', GERMANY: 'DEU', GERMAN: 'DEU', ITALY: 'ITA', ITALIAN: 'ITA',
    SPAIN: 'ESP', PORTUGAL: 'PRT', NETHERLANDS: 'NLD', BELGIUM: 'BEL', SWITZERLAND: 'CHE',
    AUSTRIA: 'AUT', SWEDEN: 'SWE', NORWAY: 'NOR', DENMARK: 'DNK', FINLAND: 'FIN', IRELAND: 'IRL',
    POLAND: 'POL', POLISH: 'POL', GREECE: 'GRC', ROMANIA: 'ROU', UKRAINE: 'UKR', RUSSIA: 'RUS', RUSSIAN: 'RUS',
    TURKEY: 'TUR', 'SAUDI ARABIA': 'SAU', 'UNITED ARAB EMIRATES': 'ARE', UAE: 'ARE', QATAR: 'QAT',
    KUWAIT: 'KWT', OMAN: 'OMN', ISRAEL: 'ISR', IRAN: 'IRN', IRAQ: 'IRQ', JORDAN: 'JOR', EGYPT: 'EGY',
    MOROCCO: 'MAR', ALGERIA: 'DZA', NIGERIA: 'NGA', GHANA: 'GHA', KENYA: 'KEN', ETHIOPIA: 'ETH',
    'SOUTH AFRICA': 'ZAF', TANZANIA: 'TZA', UGANDA: 'UGA', ZIMBABWE: 'ZWE',
    BRAZIL: 'BRA', ARGENTINA: 'ARG', CHILE: 'CHL', COLOMBIA: 'COL', PERU: 'PER', MEXICO: 'MEX',
    CUBA: 'CUB', HAITI: 'HTI', HAITIAN: 'HTI', JAMAICA: 'JAM', 'DOMINICAN REPUBLIC': 'DOM',
    MALAYSIA: 'MYS', SINGAPORE: 'SGP', INDONESIA: 'IDN', THAILAND: 'THA', VIETNAM: 'VNM',
    PHILIPPINES: 'PHL', FILIPINO: 'PHL', MYANMAR: 'MMR', CAMBODIA: 'KHM', MONGOLIA: 'MNG'
};

function normCountry(v, allowTruncate = false) {
    if (!v) return '';
    const s = String(v).toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    if (/^[A-Z]{3}$/.test(s)) return s;
    if (COUNTRY_TO_ISO3[s]) return COUNTRY_TO_ISO3[s];
    for (const [name, code] of Object.entries(COUNTRY_TO_ISO3)) {
        if (name.length >= 4 && s.includes(name)) return code;
    }
    if (allowTruncate && s.length >= 3) return s.slice(0, 3);
    return '';
}

/* =========================================================
   NAME VALIDATION
========================================================= */
const NAME_BAD_SUBSTR = ['DATE', 'DATS', 'EXPIR', 'HOLDER', 'SIGNAT', 'PASSPORT', 'PASSEPORT', 'PASAPORTE',
    'SURNAME', 'GIVEN', 'NATION', 'BIRTH', 'ISSUE', 'AUTHOR', 'REPUBLIC', 'KINGDOM', 'BRITAIN', 'IRELAND',
    'CITIZE', 'MUNICIP', 'RESIDEN', 'VALID', 'UNTIL', 'GOVERN', 'MINIST', 'AFFAIR', 'TRAVEL', 'DOCUM',
    'PLACE', 'GENDER', 'TITULAIRE', 'OBSERV', 'FIRST', 'LAST', 'MIDDLE', 'NAME',
    'RZECZPOS', 'NAZWIS', 'IMION', 'APARTMENT', 'APPARTMENT', 'ADDRESS', 'FATHER', 'MOTHER', 'SPOUSE', 'WIFE', 'HUSBAND', 'PINCODE'];
const NAME_BAD_EXACT = new Set(['MR', 'MRS', 'MS', 'DR', 'PR', 'NO', 'NOM', 'NOMS', 'OF', 'THE', 'AND', 'DE',
    'DEL', 'VON', 'GB', 'UK', 'TYPE', 'CODE', 'SEX', 'DD', 'MMM', 'YYYY', 'HMPO', 'P', 'S', 'M', 'F', 'X',
    'NAME', 'NAMES', 'FIRST', 'LAST', 'GIVEN', 'SURNAME', 'MID', 'MIDDLE',
    'POLAND', 'POLSKA', 'DEUTSCHLAND', 'ESPANA', 'ITALIA', 'NEDERLAND', 'ELLADA',
    'SVERIGE', 'DANMARK', 'NORGE', 'SUOMI', 'MAGYAR', 'HRVATSKA', 'SRBIJA',
    'JERSEY', 'SPECIMEN', 'PIN', 'BLE']);

function isNameToken(w) {
    if (!w || w.length < 2 || w.length > 30) return false;
    if (!/^[A-Z][A-Z'\-]*$/.test(w)) return false;
    if (/(.)\1{3,}/.test(w)) return false;
    if (/^REPUBL/.test(w)) return false;
    if (NAME_BAD_EXACT.has(w)) return false;
    if (w.length === 3 && ISO3.has(w)) return false;
    if (w.length >= 4 && NAME_BAD_SUBSTR.some(b => w.includes(b))) return false;
    return true;
}

const cleanNameField = (s, rawText = '') => {
    const visTextUpper = String(rawText || '').split(/\r?\n/)
        .filter(l => !l.includes('<<') && !l.startsWith('P<') && !/^[A-Z0-9<]{28,}$/.test(l.replace(/\s/g, '')))
        .join(' ').toUpperCase();

    return String(s || '').toUpperCase().split(/[^A-Z'\-]+/).map(w => {
        /* ★ STEP 1: glued MRZ filler strip */
        const m = w.match(/^([A-Z]{2,}?)([CLKSEUOZ10<]{3,})$/);
        if (m && m[1].length >= 3) w = m[1];

        /* ★ STEP 2a: leading-C chevron fix (OCR '<<' -> '<C') e.g. CANUBHAV -> ANUBHAV */
        if (w.length >= 5 && w[0] === 'C') {
            const alt = w.slice(1);
            if (visTextUpper.includes(alt) && isNameToken(alt)) w = alt;
            else {
                const alt2 = alt.slice(0, -1);
                if (alt2.length >= 4 && visTextUpper.includes(alt2) && isNameToken(alt2)) w = alt2;
            }
        }
        /* ★ STEP 2b: leading-K chevron fix (OCR '<' -> 'K') */
        if (w.length >= 6 && w[0] === 'K') {
            const alt = w.slice(1);
            if (visTextUpper.includes(alt)) w = alt;
            else {
                const alt2 = alt.slice(0, -1);
                if (alt2.length >= 4 && visTextUpper.includes(alt2)) w = alt2;
            }
        }
        return w;
    }).filter(isNameToken).map(w => {
        /* STEP 3: trailing-trim — but DON'T trim if the word is a plausible name
           (all-alpha, >= 5 chars) and ends in a letter that could be real (V, Y, B, Z)
           This prevents ANUBHAV -> ANUBHA when OCR shows ANUBHAY */
        if (visTextUpper && w.length >= 4 && !visTextUpper.includes(w)) {
            const trimmed = w.slice(0, -1);
            const isOcrSuffix = /[YVBZ]$/.test(w);
            if (trimmed.length >= 3 && visTextUpper.includes(trimmed) && !isOcrSuffix) return trimmed;
        }
        return w;
    }).join(' ').trim();
};

function reconcileNames(mrzName, visName, rawText = '') {
    const mrz = cleanNameField(mrzName, rawText);
    const vis = cleanNameField(visName, rawText);
    if (!mrz) return vis || '';
    if (!vis) return mrz || '';
    if (/LOREM|IPSUM|MIPSUM|SPECIMEN|TRAVEL|DOCUMENT/.test(mrz)) return vis;
    if (mrz === vis) return mrz;
    if (mrz.startsWith(vis) && mrz.length <= vis.length + 2) return mrz;
    if (vis.startsWith(mrz) && vis.length <= mrz.length + 2) return vis;
    if (mrz.includes(vis)) {
        if (mrz.length > vis.length + 3 && trySplitMergedName(mrz)) return vis;
        return mrz;
    }
    if (vis.includes(mrz)) {
        if (vis.length > mrz.length + 3 && trySplitMergedName(vis)) return mrz;
        return vis;
    }
    if (mrz.length >= vis.length) return mrz;
    return vis;
}

/* =========================================================
   MRZ CORE (ICAO 9303 TD3)
========================================================= */
const MRZ_W = [7, 3, 1];
const MRZ_VAL = (() => {
    const v = {};
    for (let i = 0; i < 10; i++) v[String(i)] = i;
    for (let i = 0; i < 26; i++) v[String.fromCharCode(65 + i)] = 10 + i;
    v['<'] = 0;
    return v;
})();

function mrzCheckDigit(str) {
    let sum = 0;
    for (let i = 0; i < str.length; i++) sum += (MRZ_VAL[str[i]] ?? 0) * MRZ_W[i % 3];
    return sum % 10;
}

const digAt = (s, i) => (s[i] >= '0' && s[i] <= '9') ? +s[i] : -1;

function mrzDigits(s) {
    return String(s).replace(/[OQD]/g, '0').replace(/[IL|!]/g, '1').replace(/Z/g, '2')
        .replace(/S/g, '5').replace(/G/g, '6').replace(/B/g, '8').replace(/[^0-9]/g, '');
}

function mrzDate6(raw, kind) {
    const s = mrzDigits(raw);
    if (!/^\d{6}$/.test(s)) return '';
    const yy = +s.slice(0, 2), mm = +s.slice(2, 4), dd = +s.slice(4, 6);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
    const curYY = new Date().getFullYear() % 100;
    const century = kind === 'dob' ? (yy > curYY ? 1900 : 2000) : (yy >= 60 ? 1900 : 2000);
    const out = `${century + yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    return isNaN(new Date(out).getTime()) ? '' : out;
}

function cleanMrzLine(raw) {
    return String(raw).toUpperCase().replace(/«/g, '<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
}

function td3Score(w) {
    if (w.length !== 44) return -1;
    let s = 0;
    const c9 = digAt(w, 9); if (c9 >= 0 && mrzCheckDigit(w.slice(0, 9)) === c9) s += 4;
    const c19 = digAt(w, 19); if (c19 >= 0 && mrzCheckDigit(w.slice(13, 19)) === c19) s += 3;
    const c27 = digAt(w, 27); if (c27 >= 0 && mrzCheckDigit(w.slice(21, 27)) === c27) s += 3;
    const c43 = digAt(w, 43);
    if (c43 >= 0 && mrzCheckDigit(w.slice(0, 10) + w.slice(13, 20) + w.slice(21, 43)) === c43) s += 5;
    if ('MF<'.includes(w[20])) s += 2;
    if (/^[A-Z]{3}$/.test(w.slice(10, 13))) s += 2;
    const dobV = mrzDate6(w.slice(13, 19), 'dob');
    const doeV = mrzDate6(w.slice(21, 27), 'expiry');
    const todayS = new Date().toISOString().slice(0, 10);
    if (dobV) s += 2;
    if (doeV) s += 2;
    if (doeV && doeV > todayS) s += 4;           // valid passport: expiry future me hoti hai
    if (dobV && dobV <= todayS) s += 1;
    if (dobV && dobV < '1920-01-01') s -= 5;     // 100+ saal ka dob = wrong offset
    if (doeV && doeV < '2000-01-01') s -= 3;     // 25+ saal purani expiry = wrong offset
    return s;
}
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}

function visualDocNoCandidates(rawText) {
    return String(rawText || '').split(/\r?\n/)
        .filter(l => !l.includes('<') && !/^[A-Z0-9<]{20,}$/.test(l.replace(/\s/g, '').toUpperCase()))
        .join(' ').toUpperCase().replace(/[^A-Z0-9]/g, ' ').split(/\s+/)
        .filter(t => t.length >= 6 && t.length <= 14 && /\d/.test(t));
}

function extractPassportNo(w, rawText = '') {
    const field = w.slice(0, 9);
    const base = field.replace(/</g, '');
    const chk = digAt(w, 9);

    if (chk >= 0 && mrzCheckDigit(field) !== chk) {
        const subs = { O: ['0'], Q: ['0', ''], D: ['0'], I: ['1'], L: ['1', ''], S: ['5'], B: ['8'], Z: ['2'], G: ['6'] };
        const variants = new Set();
        const rec = (i, acc) => {
            if (i === field.length) { if (acc) variants.add(acc); return; }
            if (field[i] !== '<') rec(i + 1, acc + field[i]);
            if (subs[field[i]]) for (const s of subs[field[i]]) rec(i + 1, acc + s);
        };
        rec(0, '');
        for (const v of variants) if (mrzCheckDigit(v.padEnd(9, '<')) === chk) return v;
        return base;
    }

    if (chk >= 0 && mrzCheckDigit(field) === chk) {
        const digitToLetters = { '8': ['S'], '1': ['L'], '6': ['G'], '0': ['O', 'D'], '5': ['S'], '2': ['Z'] };
        const variants = new Set([field]);
        const rec = (i, acc) => {
            if (variants.size > 200) return;
            if (i === field.length) { variants.add(acc); return; }
            rec(i + 1, acc + field[i]);
            if (digitToLetters[field[i]]) for (const s of digitToLetters[field[i]]) rec(i + 1, acc + s);
        };
        rec(0, '');
        const valid = [...variants].filter(v => mrzCheckDigit(v) === chk);
        if (valid.length > 1) {
            const visTok = visualDocNoCandidates(rawText);
            if (visTok.length) {
                let bestV = field, bestD = Infinity;
                for (const v of valid) {
                    const d = Math.min(...visTok.map(t => levenshtein(v, t)));
                    if (d < bestD) { bestD = d; bestV = v; }
                }
                const dOrig = Math.min(...visTok.map(t => levenshtein(field, t)));
                if (bestV !== field && bestD < dOrig && bestD <= Math.ceil(field.length / 2)) {
                    console.log(`[PARSER] Passport no visual-corrected: ${field} -> ${bestV} (dist ${dOrig} -> ${bestD})`);
                    return bestV.replace(/</g, '');
                }
            }
        }
        return base;
    }
    return base;
}

function trySplitMergedName(name) {
    const FILLER = new Set(['C', 'K', 'E', 'L', 'U', 'O', 'Z', '0', '<', 'S']);  // ★ 'S' add
    for (let i = 2; i < name.length - 2; i++) {
        if (name[i] === name[i + 1] && FILLER.has(name[i])) {
            const left = name.slice(0, i);
            let right = name.slice(i + 2);
            right = right.replace(/[CLKSEUOZ<01]+$/, '');
            if (left.length >= 2 && right.length >= 2 && isNameToken(left) && isNameToken(right)) {
                return { surname: left, givenNames: right };
            }
        }
    }
    return null;
}

function parseLine1(raw, expectCountry) {
    let l = String(raw).toUpperCase().replace(/[«\[\]]/g, '<').replace(/\s+/g, '').replace(/[^A-Z0-9<]/g, '');
    if (!l) return null;
    if (!l.includes('<<')) {
        l = l.replace(/(.)\1{2,}/g, (m, c) => 'CLKSEIVXZ10'.includes(c) ? '<'.repeat(m.length) : m);
    }
    let country = '', name = '';
    if (l.startsWith('P<') || l.startsWith('PS') || l.startsWith('PC') || l.startsWith('PZ') || l.startsWith('PL')) {
        country = l.slice(2, 5); name = l.slice(5);
    }
    else if (l.startsWith('P') && expectCountry && l.slice(1, 4) === expectCountry) {
        country = expectCountry; name = l.slice(4);
    }
    else if (/^<[A-Z]{3}/.test(l)) {
        country = l.slice(1, 4); name = l.slice(4);
    }
    else {
        const p = l.indexOf('P<');
        if (p >= 0 && p <= 6) { country = l.slice(p + 2, p + 5); name = l.slice(p + 5); }
        else return null;
    }
    country = country.replace(/</g, '');
    const toks = name.split(/<+/).filter(Boolean);
    const sur = toks[0] || '';
    let giv = toks.slice(1).join(' ').replace(/[^A-Z\s]/g, '').trim();
    // giv sirf filler chars (CLLK<) ho to empty maano — chevron-recovery chale
    if (sur && (!giv || /^[CLKSEUOZ<0-9]+$/.test(giv))) {
        if (/^[CLKSEUOZ<0-9]+$/.test(giv)) giv = '';
        const rec = trySplitMergedName(sur);
        if (rec) {
            console.log(`[PARSER] MRZ chevron-recovery: "${sur}" -> surname="${rec.surname}" givenNames="${rec.givenNames}"`);
            return { country, surname: rec.surname, givenNames: rec.givenNames };
        }
    }
    if (sur.length < 2) return null;
    return { country, surname: sur, givenNames: giv };
}

/* ★ FIXED extractMRZ — reconciliation loop ke BAAD (crash fix) */
function extractMRZ(text) {
    if (!text) return null;
    const cleaned = String(text).split(/\r?\n/).map(cleanMrzLine);
    const entries = [];
    cleaned.forEach((l, src) => {
        if (l.length < 20) return;
        if (!l.includes('<') && !/^[A-Z0-9]{40,}$/.test(l)) return;
        const pIdx = [];
        let p = l.indexOf('P<');
        while (p !== -1) { pIdx.push(p); p = l.indexOf('P<', p + 1); }
        if (pIdx.length >= 2 && l.length >= pIdx[1] + 40) {
            entries.push({ line: l.slice(pIdx[0], pIdx[1]), src });
            entries.push({ line: l.slice(pIdx[1], pIdx[1] + 44), src });
        } else if (pIdx.length === 1 && l.length >= pIdx[0] + 80) {
            entries.push({ line: l.slice(pIdx[0], pIdx[0] + 44), src });
            entries.push({ line: l.slice(pIdx[0] + 44, pIdx[0] + 88), src });
        } else {
            entries.push({ line: l, src });
        }
    });
    if (!entries.length) return null;

    let best = null;
    entries.forEach((e, ei) => {
        if ((e.line.match(/\d/g) || []).length < 3) return;
        const pad = '<'.repeat(2) + e.line + '<'.repeat(44);
        for (let off = 0; off + 44 <= pad.length; off++) {
            const s = td3Score(pad.slice(off, off + 44));
            if (s >= 4 && (!best || s > best.score)) best = { score: s, w: pad.slice(off, off + 44), ei };
        }
    });
    if (!best) return null;

    const w = best.w;
    const pn = extractPassportNo(w, text);
    const nationality = mrzCountry(w.slice(10, 13));
    const dob = /^\d{6}$/.test(mrzDigits(w.slice(13, 19))) ? mrzDate6(w.slice(13, 19), 'dob') : '';
    const expiry = /^\d{6}$/.test(mrzDigits(w.slice(21, 27))) ? mrzDate6(w.slice(21, 27), 'expiry') : '';
    const sex = w[20] === 'M' ? 'M' : w[20] === 'F' ? 'F' : '';

    /* `issuing` YAHIN declare hota hai */
    let surname = '', givenNames = '', issuing = '';
    for (let j = best.ei - 1; j >= 0; j--) {
        const candLine = entries[j].line;
        if (!candLine.startsWith('P<') && !candLine.includes('<<')) continue;
        const info = parseLine1(candLine, nationality);
        if (info) { surname = info.surname; givenNames = info.givenNames; issuing = info.country; break; }
    }

    /* Reconciliation — loop ke BAAD (issuing ab available hai) */
    let finalNationality = nationality;
    if (issuing && /^[A-Z]{3}$/.test(issuing) && nationality !== issuing
        && levenshtein(nationality, issuing) <= 1) {
        console.log(`[PARSER] MRZ nationality reconciled via line-1: ${nationality} -> ${issuing}`);
    }


    /* =========================================================
       PASSPORT PARSER
    ========================================================= */
    const PARTICLES = new Set(['DE', 'LA', 'LE', 'DI', 'DA', 'VAN', 'VON', 'DEL', 'DOS', 'SAN', 'MAC', 'MC']);
    const HEADER_LINE_RE = /(REPUBLIC|REPUBLI|RZECZPOSPOLITA|KINGDOM|GOVERNMENT|MINISTRY|UNION|EUROPE|PASSPORT|PASSEPORT|PASAPORTE|EMIRATES|STATES|CONFEDERATION|SULTANATE|NAZWISKO|IMIONA|BAILIWICK|ISLANDS)/;

    async function parsePassportText(rawText) {
        const result = {
            docType: 'PASSPORT',
            passportNo: '', surname: '', givenNames: '', lastName: '', firstName: '',
            nationality: '', sex: '', dob: '', doe: '', issueDate: '', issuingCountry: '',
            address: '', fatherName: '', motherName: '', spouseName: '', oldPassportNo: '', fileNo: '', placeOfBirth: '', placeOfIssue: ''
        };
        const text = String(rawText || '');

        const mrz = extractMRZ(text);
        if (mrz) {
            console.log(`[PARSER] MRZ score=${mrz.score} valid=${mrz.valid} pn=${mrz.passportNo} name=${mrz.surname}/${mrz.givenNames}`);
            result.passportNo = mrz.passportNo || '';
            result.surname = mrz.surname || '';
            result.givenNames = mrz.givenNames || '';
            result.issuingCountry = mrz.issuingCountry || '';
            result.nationality = mrz.nationality || '';
            result.dob = mrz.dob || '';
            result.doe = mrz.expiry || '';
            result.sex = mrz.sex || '';
        } else {
            console.log('[PARSER] No validated MRZ — visual zone use hoga');
        }

        const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const nextLine = (i) => (lines[i + 1] || '').toUpperCase();
        const alnumTokens = (s) => String(s).toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        const looksLikeDocNo = (t) => /^[A-Z0-9]{6,14}$/.test(t) && /\d/.test(t);
        let visualSurname = '', visualGivenNames = '';

        for (let i = 0; i < lines.length; i++) {
            const up = lines[i].toUpperCase();
            if (up.includes('<')) continue;

            if (/(PASSPORT|PASSEPORT|PASAPORTE|DOCUMENT)[^.]{0,14}(NO\.?|NUMBER|N0\.?|NUM|#)/.test(up)) {
                const cand = alnumTokens(up).filter(looksLikeDocNo).pop()
                    || alnumTokens(nextLine(i)).filter(looksLikeDocNo)[0] || '';
                if (cand) {
                    if (!result.passportNo) result.passportNo = cand;
                    else if (cand !== result.passportNo && cand.startsWith(result.passportNo)
                        && cand.length <= result.passportNo.length + 3) {
                        result.passportNo = cand;
                    }
                }
            }
            if (!visualSurname && /SURNAME|FAMILY\s*NAME|APELLIDOS|NAZWISKO/.test(up)) {
                const seg = (up.match(/(?:SURNAME|FAMILY\s*NAME|APELLIDOS|NAZWISKO)\s*[:.\/\-]?\s*(.*)$/) || [])[1] || '';
                let toks = seg.split(/[^A-Z'\-]+/).filter(isNameToken);
                if (!toks.length) toks = alnumTokens(nextLine(i)).filter(isNameToken);
                if (toks.length) visualSurname = PARTICLES.has(toks[0]) && toks[1] ? `${toks[0]} ${toks[1]}` : toks[0];
            }
            if (!visualGivenNames && /(?:GIVEN\s*NAMES?|FIRST\s*NAME|PRENOMS?|NOMBRES|IMIONA)/.test(up)) {
                const seg = up.replace(/^.*?(?:GIVEN\s*NAMES?|FIRST\s*NAME|PRENOMS?|NOMBRES|IMIONA)\s*[:.\/\-]?\s*/i, '');
                let toks = seg.split(/[^A-Z'\-]+/).filter(isNameToken);
                if (!toks.length) toks = alnumTokens(nextLine(i)).filter(isNameToken);
                if (!toks.length && lines[i + 2]) toks = alnumTokens(lines[i + 2].toUpperCase()).filter(isNameToken);
                if (toks.length) visualGivenNames = toks.slice(0, 4).join(' ');
            }
            if (!result.nationality && /(NATIONALIT|NACIONALIDAD|CITIZENSHIP|CITIZEN)/.test(up)) {
                const m = up.match(/(?:NATIONALIT\w*|NACIONALIDAD|CITIZENSHIP|CITIZEN)\s*[:\-\/]?\s*([A-Z]{3}\b|[A-Z\s]{4,30})/);
                if (m) {
                    result.nationality = normCountry(m[1].trim(), true);
                } else {
                    const cm = up.match(/([A-Z]{2,})\s+CITIZEN/);
                    if (cm) result.nationality = normCountry(cm[1].trim(), true);
                }
            }
            if (!result.sex && /\b(SEX|GENDER|SEXE)\b/.test(up)) {
                const m = up.match(/\b(?:SEX|GENDER|SEXE)\b\s*[:\-\/]?\s*\b(M|F|MALE|FEMALE|X)\b/);
                if (m) result.sex = m[1][0];
            }

            if (!result.issueDate && /(ISSUE|ISSUED|DELIVER|OFFICE\s*OF\s*ISSUE)/.test(up)
                && !/(OLD|PREVIOUS|FILE\s*NO)/.test(up)) {
                const scoped = dateAfterLabel(up, /DATE\s*OF\s*ISSUE|ISSUE[D]?\s*DATE|ISSUED?|DELIVER\w*/);
                if (scoped && scoped !== result.dob && scoped !== result.doe) result.issueDate = scoped;
                else for (let offset = 1; offset <= 3 && !result.issueDate; offset++) {
                    const d = firstDateIn(lines[i + offset] || '');
                    if (d && d !== result.dob && d !== result.doe) result.issueDate = d;
                }
            }

            if (!result.doe && /(EXPIR|VALID\s*(?:UNTIL|TO|THRU))/.test(up)) {
                const scoped = dateAfterLabel(up, /DATE\s*OF\s*EXPIR\w*|EXPIR\w*|VALID\s*(?:UNTIL|TO|THRU)/);
                if (scoped && scoped !== result.dob) result.doe = scoped;
                else for (let offset = 1; offset <= 3 && !result.doe; offset++) {
                    const d = firstDateIn(lines[i + offset] || '');
                    if (d && d !== result.dob) result.doe = d;
                }
            }

            if (!result.dob && /(BIRTH|NAISSANCE|DOB)/.test(up)) {
                for (let offset = 0; offset <= 3; offset++) {
                    if (i + offset < lines.length) {
                        const candDate = firstDateIn(lines[i + offset]);
                        if (candDate) { result.dob = candDate; break; }
                    }
                }
            }

            /* ── PLACE OF BIRTH ──────────────────────────────────────── */
            if (!result.placeOfBirth && /PLACE\s*OF\s*BIRTH|LIEU\s*DE\s*NAISSANCE|LUGAR\s*DE\s*NACIMIENTO|BIRTH\s*PLACE|POB\b/.test(up)) {
                const seg = up.replace(/.*(?:PLACE\s*OF\s*BIRTH|LIEU\s*DE\s*NAISSANCE|LUGAR\s*DE\s*NACIMIENTO|BIRTH\s*PLACE|POB\b)\s*[:.\-\/]?\s*/i, '');
                const toks = seg.split(/[^A-Z\s']+/).join(' ').split(/\s+/).filter(t => t.length >= 2 && !/^(DATE|SEX|GENDER|TYPE|NO|NUMBER|EXPIR|ISSUE|NATION)$/.test(t));
                const val = toks.join(' ').trim();
                if (val.length >= 2) result.placeOfBirth = titleCase(val);
                if (!result.placeOfBirth) {
                    const nxt = (lines[i + 1] || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').trim();
                    if (nxt.length >= 2 && !/^\d/.test(nxt)) result.placeOfBirth = titleCase(nxt.split(/\s+/).slice(0, 4).join(' '));
                }
            }
            // Fallback for place of birth: infer from address city token when still missing
            if (!result.placeOfBirth && result.address) {
                const addr = result.address;
                // Try to capture a word before the abbreviation "Cr" (e.g., "AGRA Cr")
                const crMatch = addr.match(/\b([A-Z]{2,})\b(?=\s*Cr\b)/i);
                if (crMatch) {
                    result.placeOfBirth = titleCase(crMatch[1]);
                } else {
                    // Generic fallback: first uppercase token in address parts
                    const parts = addr.split(',').map(s => s.trim());
                    for (let p of parts) {
                        const firstWord = p.split(/\s+/)[0];
                        if (/^[A-Z]{2,}$/i.test(firstWord)) {
                            result.placeOfBirth = titleCase(firstWord);
                            break;
                        }
                    }
                }
            }

            /* ── PLACE OF ISSUE ──────────────────────────────────────── */
            // Matches: 'PLACE OF ISSUE', 'PLACE OF IE' (garbled OCR), 'PLACE OF ISS', etc.
            if (!result.placeOfIssue && /PLACE\s*OF\s*(?:ISSUE|IE\b|ISS\w*|LEIS\w*)|LIEU\s*D['']EMISSION|OFFICE\s*OF\s*ISSUE|ISSUED\s*AT|ISSUING\s*OFFICE/.test(up)) {
                const seg = up.replace(/.*(?:PLACE\s*OF\s*(?:ISSUE|IE\b|ISS\w*|LEIS\w*)|LIEU\s*D['']EMISSION|OFFICE\s*OF\s*ISSUE|ISSUED\s*AT|ISSUING\s*OFFICE)\s*[:.\-\/=]?\s*/i, '');
                const cleaned = seg.replace(/\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}.*/, '').replace(/[^A-Z\s']+/g, ' ').trim();
                const toks = cleaned.split(/\s+/).filter(t => t.length >= 2 && !/^(DATE|TYPE|NO|NUMBER|EXPIR|ISSUE|NATION|VALID|UNTIL|SEX|EK|EI)$/.test(t));
                const val = toks.join(' ').trim();
                if (val.length >= 2) result.placeOfIssue = titleCase(val);
                if (!result.placeOfIssue) {
                    const nxt = (lines[i + 1] || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').trim();
                    // Prefer known city from next line
                    const cityM = nxt.match(/\b(GHAZIABAD|AGRA|DELHI|MUMBAI|CHENNAI|KOLKATA|BENGALURU|HYDERABAD|PUNE|JAIPUR|LUCKNOW)\b/);
                    if (cityM) {
                        result.placeOfIssue = titleCase(cityM[1]);
                    } else if (nxt.length >= 2 && !/^\d/.test(nxt)) {
                        result.placeOfIssue = titleCase(nxt.split(/\s+/).slice(0, 4).join(' '));
                    }
                }
            }

            /* ── FATHER'S NAME ───────────────────────────────────────── */
            if (!result.fatherName && /FATHER(?:'?S)?\s*NAME|FATHER\s*\/?(?:NAME)?|NAAM\s*VAN\s*VADER|NOM\s*DU\s*PERE/.test(up)) {
                const seg = up.replace(/.*(?:FATHER(?:'?S)?\s*NAME|FATHER\s*\/?(?:NAME)?|NAAM\s*VAN\s*VADER|NOM\s*DU\s*PERE)\s*[:.\-\/]?\s*/i, '');
                const toks = seg.split(/[^A-Z'.\-\s]+/).join(' ').split(/\s+/).filter(t => t.length >= 2 && isNameToken(t));
                if (toks.length) result.fatherName = titleCase(toks.slice(0, 5).join(' '));
                if (!result.fatherName) {
                    const nxt = (lines[i + 1] || '').replace(/[^A-Za-z\s'.]/g, '').trim();
                    const ntoks = nxt.toUpperCase().split(/\s+/).filter(t => t.length >= 2 && isNameToken(t));
                    if (ntoks.length) result.fatherName = titleCase(ntoks.slice(0, 5).join(' '));
                }
            }

            /* ── MOTHER'S NAME ───────────────────────────────────────── */
            if (!result.motherName && /MOTHER(?:'?S)?\s*NAME|MOTHER\s*\/?(?:NAME)?|NOM\s*DE\s*LA\s*MERE/.test(up)) {
                const seg = up.replace(/.*(?:MOTHER(?:'?S)?\s*NAME|MOTHER\s*\/?(?:NAME)?|NOM\s*DE\s*LA\s*MERE)\s*[:.\-\/]?\s*/i, '');
                const toks = seg.split(/[^A-Z'.\-\s]+/).join(' ').split(/\s+/).filter(t => t.length >= 2 && isNameToken(t));
                if (toks.length) result.motherName = titleCase(toks.slice(0, 5).join(' '));
                if (!result.motherName) {
                    const nxt = (lines[i + 1] || '').replace(/[^A-Za-z\s'.]/g, '').trim();
                    const ntoks = nxt.toUpperCase().split(/\s+/).filter(t => t.length >= 2 && isNameToken(t));
                    if (ntoks.length) result.motherName = titleCase(ntoks.slice(0, 5).join(' '));
                }
                // Ensure motherName is explicitly empty if not found
                if (!result.motherName) result.motherName = '';
                // If motherName ended up same as fatherName, clear it to trigger fallback
                if (result.motherName && result.fatherName && result.motherName === result.fatherName) {
                    result.motherName = '';
                }
            }

            /* ── SPOUSE / WIFE / HUSBAND NAME ────────────────────────── */
            // Also catches garbled OCR: 'fa ame Spots Le f', 'SASS', 'SPOASS', etc.
            const SPOUSE_RE_IDX = /SPOUSE(?:'?S)?\s*NAME|WIFE(?:'?S)?\s*NAME|HUSBAND(?:'?S)?\s*NAME|CONJOINT|\bSASS\b|\bSPOASS\b|\bSPOAS[A-Z]*|\bSPOUSA\b|\bSPOTS\b|\bSPOUS\b|AME\s+SPOT|FA\s+AME|PEI\s+OT\s+SP|NAME\s+OF\s+SP/;
            if (!result.spouseName && SPOUSE_RE_IDX.test(up)) {
                // The label line itself is garbled — always take the NEXT line as the name
                const nxt = (lines[i + 1] || '').replace(/[^A-Za-z\s'.]/g, '').trim();
                const ntoks = nxt.toUpperCase().split(/\s+/).filter(t => t.length >= 2 && isNameToken(t));
                if (ntoks.length >= 2) {
                    result.spouseName = titleCase(ntoks.slice(0, 5).join(' '));
                } else {
                    // Try inline extraction for clean labels like 'SPOUSE NAME: SUNITA AGARWAL'
                    const seg = up.replace(/.*(?:SPOUSE(?:'?S)?\s*NAME|WIFE(?:'?S)?\s*NAME|HUSBAND(?:'?S)?\s*NAME|CONJOINT)\s*[:.\-\/]?\s*/i, '');
                    const toks = seg.split(/[^A-Z'\-]+/).filter(isNameToken);
                    if (toks.length >= 2) result.spouseName = titleCase(toks.slice(0, 5).join(' '));
                }
                if (!result.spouseName) result.spouseName = '';
            }
            // Additional fallback for mother and spouse names when typical patterns miss them
            if (!result.motherName) {
                for (let j = 0; j < lines.length; j++) {
                    const l = lines[j].toUpperCase();
                    if (/(MOTHER|MADRE|MOTH|MOTHES)/.test(l) && !/DOB|DATE|SEX|GENDER/.test(l)) {
                        const tokens = l.replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(t => t.length >= 2 && isNameToken(t) && !/^(MOTHER|MADRE|MOTH|MOTHES|FATHER)$/i.test(t));
                        // Skip if tokens form the same name as fatherName
                        const candidate = tokens.length ? titleCase(tokens.slice(0, 5).join(' ')) : '';
                        if (candidate && candidate !== result.fatherName) {
                            result.motherName = candidate;
                            break;
                        }
                    }
                }
                if (!result.motherName) result.motherName = '';
            }



        }
        if (!result.spouseName) {
            // Explicit keyword based extraction (including garbled variants)
            const SPOUSE_FALLBACK_RE = /(SPOUSE|WIFE|HUSBAND|CONJOINT|SASS|SPOASS|SPOTS|SPOUS|FA\s+AME)/;
            for (let j = 0; j < lines.length; j++) {
                const l = lines[j].toUpperCase();
                if (SPOUSE_FALLBACK_RE.test(l) && !/DOB|DATE|SEX|GENDER/.test(l)) {
                    // Garbled label — take next line
                    const nxtLine = (lines[j + 1] || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').trim();
                    const nxtToks = nxtLine.split(/\s+/).filter(t => t.length >= 2 && isNameToken(t));
                    if (nxtToks.length >= 2) {
                        const candidate = titleCase(nxtToks.slice(0, 5).join(' '));
                        if (candidate && candidate !== result.fatherName && candidate !== result.motherName) {
                            result.spouseName = candidate;
                            break;
                        }
                    }
                }
            }
        }
    }
    if (!result.spouseName) result.spouseName = '';




    /* ── ADDRESS ─────────────────────────────────────────────── */
    if (!result.address && /\bADDRESS\b|\bRESIDENCE\b|\bDOMICILE\b/.test(up)
        && !/(ISSUE|OFFICE|AUTHORITY|PASSPORT|OLD|FILE)/.test(up)) {
        const seg = up.replace(/.*(?:\bADDRESS\b|\bRESIDENCE\b|\bDOMICILE\b)\s*[:.\-\/]?\s*/i, '');
        const cleaned = seg.trim();
        if (cleaned.length >= 5) {
            result.address = titleCase(cleaned.replace(/[<>]/g, '').trim());
        } else {
            // Collect up to 3 following lines for multi-line addresses
            const addrParts = [];
            for (let off = 1; off <= 3; off++) {
                const ln = (lines[i + off] || '').trim();
                if (!ln || /^(FATHER|MOTHER|SPOUSE|DATE|ISSUE|EXPIR|VALID|NATION|GENDER|SEX|PIN|FILE|OLD)/i.test(ln)) break;
                addrParts.push(ln);
            }
            if (addrParts.length) result.address = titleCase(addrParts.join(', '));
        }
    }

    /* ── OLD / PREVIOUS PASSPORT NUMBER ──────────────────────── */
    if (!result.oldPassportNo && /(OLD|PREVIOUS|PRIOR)\s*PASSPORT\s*(?:NO\b|NUMBER|NUM\b|#)?|(PASSPORT|DOC)\s*(?:NO\b|NUMBER|NUM\b)\s*\(?\s*(?:OLD|PREV|PREVIOUS)\s*\)?/.test(up)) {
        const combined = up + ' ' + (lines[i + 1] || '').toUpperCase();
        const tok = combined.replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).find(t => t.length >= 5 && t.length <= 14 && /[A-Z]/.test(t) && /\d/.test(t));
        if (tok) result.oldPassportNo = tok;
    }

    /* ── FILE NUMBER ─────────────────────────────────────────── */
    if (!result.fileNo && /FILE\s*(?:NO\b|NUMBER|NUM\b|#)/.test(up)) {
        const combined = up + ' ' + (lines[i + 1] || '').toUpperCase();
        const tok = combined.replace(/[^A-Z0-9\s\/\-]/g, ' ').split(/\s+/).find(t => t.length >= 3 && t.length <= 20 && /\d/.test(t));
        if (tok) result.fileNo = tok;
    }
    // Fallback 1: Indian file number format letter + 12-16 digits (e.g. GZ2077259502622)
    if (!result.fileNo) {
        for (const l of lines) {
            if (l.includes('<')) continue;
            const fm = l.match(/(?:^|[^A-Z0-9])([A-Z]\s*\d{12,16})(?:[^A-Z0-9]|$)/);
            if (fm) { result.fileNo = fm[1].replace(/\s/g, ''); break; }
        }
    }
    // Fallback 2: pure digit file numbers (12-16 digits) anywhere in line
    if (!result.fileNo) {
        for (const l of lines) {
            if (l.includes('<')) continue;
            const fm2 = l.match(/\b(\d{12,16})\b/);
            if (fm2) { result.fileNo = fm2[1]; break; }
        }
    }
    // Fallback 3: alphanumeric like GZ1234567890123 on its own line
    if (!result.fileNo) {
        for (const l of lines) {
            if (l.includes('<')) continue;
            const m2 = l.toUpperCase().match(/^[A-Z]{1,2}\d{10,16}$/);
            if (m2) { result.fileNo = m2[0].trim(); break; }
        }
    }



    result.surname = reconcileNames(result.surname, visualSurname, text);
    result.givenNames = reconcileNames(result.givenNames, visualGivenNames, text);

    if (!mrz && (!result.dob || !result.doe)) {
        const all = [];
        for (const line of lines) {
            if (line.includes('<')) continue;
            for (const m of line.toUpperCase().matchAll(DATE_RE)) {
                const d = toISO(m[0]);
                if (d && !all.includes(d) && d !== result.dob && d !== result.doe) all.push(d);
            }
        }
        const sorted = [...all].sort();
        const today = new Date().toISOString().slice(0, 10);
        if (!result.dob) result.dob = sorted.filter(d => d <= today)[0] || '';
        if (!result.doe) result.doe = sorted[sorted.length - 1] || '';
    }

    if (ENABLE_IDP) {
        (async () => {
            try {
                const merged = await processDocument('PASSPORT', text);
                mergeFill(result, merged);
            } catch (e) {
                console.warn('[PARSER] LLM merge failed:', e.message);
            }
        })();
    }

    result.passportNo = (result.passportNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    result.surname = cleanNameField(result.surname, text);
    result.givenNames = cleanNameField(result.givenNames, text);

    /* ── Normalize optional fields ────────────────────────────────── */
    const cleanPlace = (s) => {
        if (!s) return '';
        // Remove trailing date-like patterns or junk tokens
        let v = String(s).replace(/\s*\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}.*$/, '')
            .replace(/\s*(DATE|SEX|GENDER|NO|NUMBER|EXPIR|ISSUE|NATION|TYPE|VALID).*$/i, '')
            .replace(/[<>]/g, '').trim();
        // Remove leading label remnants (e.g. "Issue" still attached)
        v = v.replace(/^(PLACE|OF|ISSUE|BIRTH|LIEU|AUTHORITY)\s+/gi, '').trim();
        if (v.length < 2 || v.length > 80) return '';
        return titleCase(v);
    };
    const cleanPersonName = (s) => {
        if (!s) return '';
        let v = String(s).replace(/\s*(DATE|SEX|GENDER|ISSUE|EXPIR|NATION|NUMBER|ADDRESS|FILE|PIN).*$/i, '').trim();
        if (v.length < 2 || v.length > 60) return '';
        // Remove any digit-only tokens
        v = v.split(/\s+/).filter(t => !/^\d+$/.test(t)).join(' ');
        return titleCase(v);
    };

    result.placeOfBirth = cleanPlace(result.placeOfBirth);
    result.placeOfIssue = cleanPlace(result.placeOfIssue);
    result.fatherName = cleanPersonName(result.fatherName);
    result.motherName = cleanPersonName(result.motherName);
    result.spouseName = cleanPersonName(result.spouseName);
    result.address = (result.address || '').replace(/[<>]/g, '').trim().slice(0, 200) || '';
    result.oldPassportNo = (result.oldPassportNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
    result.fileNo = (result.fileNo || '').toUpperCase().replace(/[^A-Z0-9\/\-]/g, '').slice(0, 20);


    /* Slash fallback */
    {
        const LABEL_WORDS = /^(TYPE|SURNAME|FAMILY|GIVEN|NAMES?|NOM|PRENOMS?|APELLIDOS|PASSEPORT|PASSPORT|CODE|COUNTRY|DATE|BIRTH|ISSUE|EXPIR|SEX|GENDER|PLACE|LIEU|NATIONALIT|AUTHORITY|OFFICE|REPUBLIC|INDIA|VALID|NUMBER|DOCUMENT)$/i;
        const slashMatches = [];
        for (const line of lines) {
            if (line.includes('<')) continue;
            const U = line.toUpperCase();
            if (HEADER_LINE_RE.test(U)) continue;
            const slashRe = /([A-Z]{2,})\s*\/\s*([A-Z]{2,})/g;
            let m;
            while ((m = slashRe.exec(U)) !== null) {
                const left = m[1];
                const right = m[2].replace(/[^A-Z]/g, '');
                if (LABEL_WORDS.test(left) || LABEL_WORDS.test(right)) continue;
                slashMatches.push({ left, right });
            }
        }
        let bestSlash = null;
        if (result.surname) {
            bestSlash = slashMatches.find(s =>
                s.left.includes(result.surname) || result.surname.includes(s.left) ||
                s.right.includes(result.surname) || result.surname.includes(s.right)) || null;
        } else if (slashMatches.length) {
            bestSlash = slashMatches.find(s => isNameToken(s.left) && isNameToken(s.right)) || null;
        }
        if (bestSlash) {
            const currentTokens = (result.givenNames || '').split(/\s+/).filter(Boolean);
            const allShort = currentTokens.length > 0 && currentTokens.every(t => t.length <= 2);
            if (!result.givenNames || allShort) {
                let cleanGiven = bestSlash.right;
                cleanGiven = cleanGiven.replace(/([A-Z]{3,}?)(?:L{2,}|K{2,}|[LKCSXZ]{3,}).*$/i, '$1');
                if (cleanGiven.length >= 3) result.givenNames = cleanGiven;
            }
            if (!result.surname || result.surname.length <= 2) {
                if (bestSlash.left.length >= 3) result.surname = bestSlash.left;
            }
        }
    }

    /* Quality check */
    {
        const gTokens = (result.givenNames || '').split(/\s+/).filter(Boolean);
        const allGarbage = gTokens.length > 0 && gTokens.every(t => t.length <= 2);
        if (!result.givenNames || allGarbage) {
            for (const line of lines) {
                if (line.includes('<')) continue;
                const up = line.toUpperCase();
                if (HEADER_LINE_RE.test(up) || /(NUMBER|DATE|BIRTH|ISSUE|EXPIR|AUTHORITY|ADDRESS|PIN|TYPE)/.test(up)) continue;
                if (result.surname && up.includes(result.surname)) {
                    const toks = up.split(/[^A-Z'\-]+/).filter(t => isNameToken(t) && t !== result.surname);
                    if (toks.length) { result.givenNames = toks.join(' '); break; }
                }
            }
        }
    }

    /* Standalone name-line recovery */
    if (!result.givenNames) {
        const blob = String(text).toUpperCase().split(/\r?\n/)
            .map(l => l.replace(/[^A-Z<]/g, ''))
            .filter(l => l.startsWith('P<') || (l.includes('<<') && l.length >= 25))
            .join('').replace(/[^A-Z]/g, '');
        if (blob) {
            for (const line of lines) {
                const t = line.trim().toUpperCase();
                if (!/^[A-Z]{2,}$/.test(t)) continue;
                if (!isNameToken(t)) continue;
                if (result.surname && (t === result.surname || result.surname.includes(t))) continue;
                if (blob.includes(t)) {
                    console.log(`[PARSER] Standalone name line recovered: "${t}"`);
                    result.givenNames = t;
                    break;
                }
            }
        }
    }

    // Unified extraction pass for name – only if missing
    if (!result.givenNames || !result.surname) {
        let nameFound = false;
        for (const line of lines) {
            if (line.includes('<')) continue;
            const up = line.toUpperCase();
            if (HEADER_LINE_RE.test(up)) continue;
            if (!nameFound && !result.givenNames && !result.surname) {
                const toks = up.split(/[^A-Z'\-]+/).filter(t => t.length >= 2 && isNameToken(t));
                if (toks.length >= 2 && toks.length <= 4) {
                    result.givenNames = toks.slice(0, -1).join(' ');
                    result.surname = toks[toks.length - 1];
                    nameFound = true;
                }
            }
            // Explicit marker detection if name fields still missing
            if (!result.givenNames || !result.surname) {
                const lastMatch = up.match(/LAST\s+(?:NAME|ANME|NME)\s*[:\-]?\s*([A-Z\s]{2,})/);
                if (lastMatch && !result.surname) result.surname = lastMatch[1].trim().replace(/\s+/g, ' ');
                const firstMatch = up.match(/(?:FIRST|FRIST|FIST)\s+NAME\s*[:\-]?\s*([A-Z\s]{2,})/);
                if (firstMatch && !result.givenNames) result.givenNames = firstMatch[1].trim().replace(/\s+/g, ' ');
            }
        }
    }
    // Fallback generic token extraction if still missing
    if (!result.givenNames) {
        for (const line of lines) {
            if (line.includes('<') || HEADER_LINE_RE.test(line.toUpperCase())) continue;
            const toks = line.toUpperCase().split(/[^A-Z'\-]+/).filter(t => t.length >= 2 && isNameToken(t));
            if (toks.length >= 2 && toks.length <= 4) {
                result.givenNames = toks.slice(0, -1).join(' ');
                if (!result.surname) result.surname = toks[toks.length - 1];
                break;
            }
        }
    }



    result.nationality = normCountry(result.nationality);
    result.issuingCountry = normCountry(result.issuingCountry) || result.nationality;
    result.sex = /^(M|MALE)/i.test(result.sex || '') ? 'M' : /^(F|FEMALE)/i.test(result.sex || '') ? 'F'
        : /^(X|OTHER)/i.test(result.sex || '') ? 'X' : '';
    result.dob = toISO(result.dob);
    result.doe = toISO(result.doe);
    result.issueDate = toISO(result.issueDate);

    /* Evidence-based issueDate */
    if (!result.issueDate && mrz && mrz.valid && result.dob && result.doe) {
        const extras = new Set();
        for (const line of lines) {
            if (line.includes('<')) continue;
            const U = line.toUpperCase();
            for (const m of U.matchAll(DATE_RE)) {
                const d = toISO(m[0]);
                if (d && d !== result.dob && d !== result.doe) extras.add(d);
            }
            for (const m of U.matchAll(/\b(\d{2})(\d{2})(\d{4})\b/g)) {
                const d = iso(m[3], m[2], m[1]);
                if (d && d !== result.dob && d !== result.doe) extras.add(d);
            }
        }
        const cands = [...extras].filter(d => d > result.dob && d < result.doe);
        if (cands.length === 1) {
            const yrs = (new Date(result.doe) - new Date(cands[0])) / (365.25 * 24 * 3600 * 1000);
            if (yrs > 0 && yrs <= 15) {
                console.log(`[PARSER] issueDate from leftover visual date: ${cands[0]}`);
                result.issueDate = cands[0];
            }
        } else if (cands.length > 1) {
            /* ★ 10/5-year rule: adult passport ~10 saal valid hota hai.
               doe - 10y ke ±45 din wala candidate = issue date.
               (SUNITA: doe=2033-02-21 → target 2023-02-21 → 2023-02-22 sirf 1 din off ✓;
                purane passport ki 2010-11-15 date 12 saal door → reject ✓) */
            const pick = (yearsBack) => {
                const t = new Date(result.doe);
                t.setFullYear(t.getFullYear() - yearsBack);
                const target = t.toISOString().slice(0, 10);
                let best = null, bestDiff = Infinity;
                for (const c of cands) {
                    const diff = Math.abs((new Date(c) - new Date(target)) / 86400000);
                    if (diff < bestDiff) { bestDiff = diff; best = c; }
                }
                return bestDiff <= 45 ? best : null;
            };
            const hit = pick(10) || pick(5);   // adult 10y, child 5y validity
            if (hit) {
                console.log(`[PARSER] issueDate via validity-proximity rule: ${hit}`);
                result.issueDate = hit;
            }
        }
    }
    const today = new Date().toISOString().slice(0, 10);
    if (result.dob && result.dob > today) result.dob = '';
    if (result.dob && result.doe && result.doe < result.dob) { const t = result.dob; result.dob = result.doe; result.doe = t; }
    if (result.issueDate && result.doe && result.issueDate > result.doe) { const t = result.issueDate; result.issueDate = result.doe; result.doe = t; }
    if (result.issueDate && result.dob && result.issueDate < result.dob) result.issueDate = '';

    // Additional fallback: infer issueDate from visual dates if still missing
    if (!result.issueDate && result.doe) {
        const candidateDates = [];
        for (const line of lines) {
            for (const m of line.toUpperCase().matchAll(DATE_RE)) {
                const d = toISO(m[0]);
                if (d && d !== result.dob && d !== result.doe) candidateDates.push(d);
            }
        }
        const filtered = candidateDates.filter(d => {
            if (result.dob && d <= result.dob) return false;
            return d < result.doe;
        });

        if (filtered.length) {
            // Pick the date closest to doe - 10 years, or doe - 5 years
            const t10 = new Date(result.doe); t10.setFullYear(t10.getFullYear() - 10);
            const t5 = new Date(result.doe); t5.setFullYear(t5.getFullYear() - 5);
            let best = null, bestDiff = Infinity;
            for (const d of filtered) {
                const diff10 = Math.abs((new Date(d) - t10) / 86400000);
                const diff5 = Math.abs((new Date(d) - t5) / 86400000);
                const minDiff = Math.min(diff10, diff5);
                if (minDiff < bestDiff) { bestDiff = minDiff; best = d; }
            }
            if (best && bestDiff <= 400) { // allow a bit more leeway for fallback
                result.issueDate = best;
                console.log(`[PARSER] inferred issueDate from visual dates: ${result.issueDate}`);
            }
        }

        // Blind mathematical inference if still missing (typically 10 or 5 years before doe)
        if (!result.issueDate && result.doe) {
            const t = new Date(result.doe);
            let years = 10;
            if (result.dob) {
                const ageAtIssue = (t.getFullYear() - 10) - new Date(result.dob).getFullYear();
                if (ageAtIssue < 15) years = 5;
            }
            t.setFullYear(t.getFullYear() - years);
            t.setDate(t.getDate() + 1); // often issued 1 day after expiry offset
            const inferred = t.toISOString().slice(0, 10);

            // double check we don't go before dob
            if (!result.dob || inferred > result.dob) {
                result.issueDate = inferred;
                console.log(`[PARSER] blindly inferred issueDate mathematically: ${result.issueDate}`);
            }
        }
    }

    if (!result.nationality) {
        for (const line of lines) {
            if (line.includes('<')) continue;
            const m = line.toUpperCase().match(/(?:NATIONALIT\w*|CITIZENSHIP)\s*[:\-\/]?\s*([A-Z\s]{3,30})/);
            if (m) {
                const code = normCountry(m[1].trim(), true);
                if (code) { result.nationality = code; break; }
            }
        }
    }
    if (!result.sex) {
        for (const line of lines) {
            if (line.includes('<')) continue;
            const m = line.toUpperCase().match(/\b(?:SEX|GENDER|SEXE)\b\s*[:\-\/]?\s*\b(MALE|FEMALE|M|F|X)\b/);
            if (m) { result.sex = m[1][0]; break; }
        }
    }
    if (!result.firstName) {
        if (result.givenNames) {
            result.firstName = result.givenNames.split(' ')[0] || result.givenNames;
        } else if (result.surname) {
            result.firstName = result.surname.split(' ')[0];
        }
    }
    const finalG = (result.givenNames || '').split(/\s+/).filter(Boolean);
    if (finalG.length > 0 && finalG.every(t => t.length <= 2)) {
        console.warn(`[PARSER] givenNames garbage ("${result.givenNames}") — clearing`);
        result.givenNames = '';
        result.firstName = '';
    }
    // Ensure lastName mirrors surname if not set
    if (!result.lastName && result.surname) {
        result.lastName = result.surname;
    }

    // Additional fallback: try to extract a name line when both surname and givenNames are missing
    if (!result.surname || !result.givenNames) {
        for (const line of lines) {
            if (line.includes('<')) continue;
            const up = line.toUpperCase().trim();
            // Heuristic: line with 2‑4 words, each word at least 2 characters, all alphabetic
            if (/^(?:[A-Z]{2,}\s+){1,3}[A-Z]{2,}$/.test(up)) {
                const parts = up.split(/\s+/);
                if (!result.surname && parts.length) {
                    result.surname = parts.pop();
                }
                if (!result.givenNames && parts.length) {
                    result.givenNames = parts.join(' ');
                }
                break;
            }
        }
    }
    return result;
}

/* =========================================================
   INSURANCE PARSER
========================================================= */
const KNOWN_PROVIDERS = [
    'ORIENTAL INSURANCE', 'NEW INDIA ASSURANCE', 'UNITED INDIA INSURANCE', 'NATIONAL INSURANCE',
    'HDFC ERGO', 'ICICI LOMBARD', 'BAJAJ ALLIANZ', 'TATA AIG', 'STAR HEALTH', 'NIVA BUPA',
    'MAX LIFE', 'SBI LIFE', 'SBI GENERAL', 'RELIANCE GENERAL', 'FUTURE GENERALI', 'IFFCO TOKIO',
    'CHOLA MS', 'GO DIGIT', 'ACKO', 'ALLIANZ', 'AXA', 'METLIFE', 'AETNA', 'CIGNA',
    'BLUE CROSS', 'UNITEDHEALTHCARE', 'KAISER PERMANENTE', 'STATE FARM', 'PROGRESSIVE', 'GEICO', 'LIC'
];

async function parseInsuranceText(rawText) {
    const result = { docType: 'INSURANCE', insuranceType: '', policyNo: '', provider: '', memberName: '', groupNo: '', effectiveDate: '', dob: '', doe: '' };
    const text = String(rawText || '').replace(/[©®™¢£¥]/g, ' ');
    const upper = text.toUpperCase();
    const lines = text.split(/\r?\n/)
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(l => Boolean(l) && !/scanned with|camscanner|adobe scan|oken scanner/i.test(l));

    /* 1) LLM first (insurance layouts vary wildly) */
    if (ENABLE_IDP) {
        try { mergeFill(result, await processDocument('INSURANCE', text)); }
        catch (e) { console.warn('[PARSER] LLM merge failed:', e.message); }
    }

    /* 1.5) Determine Insurance Type */
    if (!result.insuranceType) {
        if (/\b(HEALTH|MEDICLAIM|MEDICAL|HOSPITAL|DISEASE|CLINIC)\b/.test(upper)) {
            result.insuranceType = 'HEALTH';
        } else if (/\b(AUTO|MOTOR|VEHICLE|CAR|TWO WHEELER|BIKE|SCOOTER|COMMERCIAL VEHICLE)\b/.test(upper)) {
            result.insuranceType = 'AUTO';
        } else if (/\b(LIFE|TERM|ENDOWMENT|ANNUITY|DEATH BENEFIT)\b/.test(upper)) {
            result.insuranceType = 'LIFE';
        } else if (/\b(TRAVEL|TRIP|BAGGAGE)\b/.test(upper)) {
            result.insuranceType = 'TRAVEL';
        } else if (/\b(HOME|PROPERTY|FIRE|BURGLARY)\b/.test(upper)) {
            result.insuranceType = 'HOME';
        } else {
            result.insuranceType = 'GENERAL';
        }
    }

    /* 2) Provider — header line + known list. Company-name-like line with
          INSURANCE/ASSURANCE/LIFE/GENERAL, par policy-label words nahi */
    if (!result.provider) {
        for (const line of lines.slice(0, 12)) {
            const U = line.toUpperCase();
            if (/(INSURANCE|ASSURANCE|GENERAL|LIFE|HEALTH)\b/.test(U) && U.length < 70
                && !/(POLICY|CERTIFICATE|NO\.?|NUMBER|DATE|NAME|PERIOD|PREMIUM|VALID|SUM|MEMBER)/.test(U)) {
                const cleaned = titleCase(line.replace(/[^A-Za-z\s&.\-]/g, '').trim());
                if (cleaned.length >= 4) { result.provider = cleaned; break; }
            }
        }
    }
    if (!result.provider) {
        for (const p of KNOWN_PROVIDERS) { if (upper.includes(p)) { result.provider = titleCase(p); break; } }
    }

    /* 3) Policy number — noisy-label patterns + same/next-2-line token scan */
    const BAD_POLICY_WORDS = new Set(['POLICY', 'NUMBER', 'POLICYNO', 'CERTIFICATE', 'MEMBERSHIP', 'INSURANCE', 'DETAILS', 'STATEMENT', 'NO', 'PERIOD', 'PREMIUM', 'VALID', 'COVER', 'PLAN', 'CODE']);
    const truncateRe = /\s+(?:VALID|EXPIR|DATE|UNTIL|THRU|EFFECTIVE|FROM|TO|ISSUED|CARD|NAME|PLAN|CODE|PERIOD|SUM|PREMIUM)\b/i;

    if (!result.policyNo) {
        const patterns = [
            /POL\s*(?:IC)?\s*Y\s*(?:NO\.?|NUMBER|N0|NE|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,35})/i,
            /(?:POLY|POLCY|POUCY|POLISY)\s*(?:NO\.?|#|N0)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,35})/i,
            /CERTIFICATE\s*(?:NO\.?|NUMBER|N0)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,35})/i,
            /MEMBERSHIP\s*(?:NO\.?|NUMBER|N0|ID)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{4,35})/i,
            /POLICY\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{5,35})/i,
        ];
        for (const p of patterns) {
            const m = upper.match(p);
            if (m) {
                let rawVal = m[1].split(truncateRe)[0];
                const v = rawVal.replace(/[^A-Z0-9\-\/]/gi, '');
                if (v.length >= 5 && !BAD_POLICY_WORDS.has(v.toUpperCase()) && /\d/.test(v)) {
                    result.policyNo = v;
                    break;
                }
            }
        }
    }
    if (!result.policyNo) {
        for (let i = 0; i < lines.length; i++) {
            const U = lines[i].toUpperCase();
            if (/(POL\s*IC\s*Y|POLY|POLCY|POUCY|POLISY|CERTIFICATE|MEMBERSHIP)\s*(NO\.?|NUMBER|N0|#)?/.test(U)) {
                const combined = (U + ' ' + (lines[i + 1] || '').toUpperCase() + ' ' + (lines[i + 2] || '').toUpperCase())
                    .split(truncateRe)[0]
                    .replace(/[^A-Z0-9\-\/]/g, ' ')
                    .split(/\s+/)
                    .filter(t => t.length >= 5 && t.length <= 25 && /\d/.test(t)
                        && !BAD_POLICY_WORDS.has(t) && !/^\d{4}$/.test(t) && !/^\d{1,2}[\/\-\.]/.test(t));
                if (combined.length) { result.policyNo = combined[0]; break; }
            }
        }
    }

    /* 4) Member / insured name */
    const BAD_MEMBER_NAMES = new Set(['BIZDIRECT', 'LIMITED', 'LTD', 'PVT', 'COMPANY', 'CORPORATION', 'SERVICES', 'HEALTHCARE', 'INSURANCE', 'AGENCY', 'CARD', 'GOVT', 'INDIA', 'NATIONAL', 'OKEN', 'CAMSCANNER', 'ADOBE', 'SCANNER', 'PORTAL', 'SYSTEM', 'DIRECT']);

    const cleanMemberName = (raw) => {
        let v = String(raw || '').replace(/\s+(ISSUE|OFFICE|ADDRESS|CODE|DATE|POLICY|NO\.?|PERIOD|PLAN|SUM).*/i, '').trim();
        for (let loop = 0; loop < 3; loop++) {
            v = v.replace(/^(?:NAME|INSURED|MEMBER|CUSTOMER|POLICY|HOLDER|OF|THE|MR|MRS|MS|DR|MISS|NUMBER)\b[.:\s]*/gi, '').trim();
        }
        if (BAD_MEMBER_NAMES.has(v.toUpperCase())) return '';
        if (/\d/.test(v)) return '';
        if (v.length < 3 || v.length > 50) return '';
        return titleCase(v);
    };

    if (!result.memberName) {
        const p = /(?:INSURED\s*NAME|NAME\s*OF\s*(?:THE\s*)?INSURED|MEMBER\s*NAME|CUSTOMER\s*NAME|POLICY\s*HOLDER|POLICYHOLDER|PROPOSER\s*(?:NAME)?|PATIENT\s*(?:NAME)?|BENEFICIARY\s*(?:NAME)?|EMPLOYEE\s*NAME)\s*[:.\-]?\s*([A-Z][A-Z\s.&'\-]{2,48})/i;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const m = line.toUpperCase().match(p);
            if (m) {
                const cleaned = cleanMemberName(m[1]);
                if (cleaned.length >= 3) { result.memberName = cleaned; break; }
            }
            // label line -> name same/next/next-next line pe
            if (/(?:INSURED\s*NAME|MEMBER\s*NAME|POLICY\s*HOLDER|CUSTOMER\s*NAME|PROPOSER|PATIENT)/i.test(line.toUpperCase())) {
                for (const off of [1, 2]) {
                    const nextL = lines[i + off] || '';
                    if (/(POLICY|DATE|NO\.?|PERIOD|SUM|PREMIUM|VALID)/i.test(nextL.toUpperCase())) continue;
                    const cleanedNext = cleanMemberName(nextL);
                    if (cleanedNext.length >= 3) { result.memberName = cleanedNext; break; }
                }
                if (result.memberName) break;
            }
        }
    }
    if (!result.memberName) {
        for (const line of lines) {
            const m = line.toUpperCase().match(/\bNAME\s*[:.\-]\s*([A-Z][A-Z\s.&'\-]{2,48})/i);
            if (m) {
                const cleaned = cleanMemberName(m[1]);
                if (cleaned.length >= 3) { result.memberName = cleaned; break; }
            }
        }
    }
    // last resort: 2-4 capitalized name-like tokens wali line (labels exclude)
    if (!result.memberName) {
        for (const line of lines) {
            const U = line.toUpperCase();
            if (/(POLICY|INSURANCE|ASSURANCE|CERTIFICATE|DATE|PERIOD|PREMIUM|SUM|VALID|EFFECTIVE|EXPIR|ADDRESS|PIN|CODE|PLAN|COVER)/.test(U)) continue;
            const toks = U.replace(/[^A-Z'\s\-]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && /^[A-Z][A-Z'\-]*$/.test(t));
            if (toks.length >= 2 && toks.length <= 4) {
                const cleaned = cleanMemberName(toks.join(' '));
                if (cleaned.length >= 3) { result.memberName = cleaned; break; }
            }
        }
    }

    /* 5) Group number / insured code */
    if (!result.groupNo) {
        const m = upper.match(/(?:GROUP|GRP)\s*(?:NO\.?|NUMBER|#|ID)\s*[:.\-]?\s*([A-Z0-9\-]{3,20})/i)
            || upper.match(/INSURED\s*CODE\s*[:.\-]?\s*([A-Z0-9\-]{3,20})/i);
        if (m && !BAD_POLICY_WORDS.has(m[1].trim())) result.groupNo = m[1].trim();
    }

    /* 6) Labeled dates — English + W.E.F. + Hinglish variants */
    for (const line of lines) {
        const U = line.toUpperCase();
        const d = firstDateIn(U);
        if (!d) continue;
        if (!result.dob && /(BIRTH|DOB)/.test(U)) result.dob = d;
        else if (!result.effectiveDate && /(EFFECTIVE|COMMENCEMENT|START|ISSUE|INCEPTION|VALID\s*FROM|W\.?\s*E\.?\s*F\.?)/.test(U)) result.effectiveDate = d;
        else if (!result.doe && /(EXPIR|VALID\s*(?:UNTIL|TO|THRU)|TERMINAT|END\s*DATE)/.test(U)) result.doe = d;
    }

    /* 7) "Period: FROM <date> TO <date>" (incl. DDMMYYYY concatenated) */
    if (!result.effectiveDate || !result.doe) {
        for (const line of lines) {
            const U = line.toUpperCase();
            if (!U.includes('FROM') && !U.includes('PERIOD') && !U.includes('TO')) continue;
            const found = [];
            for (const m of U.matchAll(DATE_RE)) { const d = toISO(m[0]); if (d) found.push({ iso: d, idx: m.index }); }
            for (const m of U.matchAll(/\b(\d{2})(\d{2})(\d{4})\b/g)) {
                const d = `${m[3]}-${m[2]}-${m[1]}`;
                if (!isNaN(new Date(d).getTime())) found.push({ iso: d, idx: m.index });
            }
            const toIdx = U.indexOf(' TO ');
            found.sort((a, b) => a.idx - b.idx);
            for (const f of found) {
                if (toIdx >= 0 && f.idx < toIdx) { if (!result.effectiveDate) result.effectiveDate = f.iso; }
                else if (!result.doe) result.doe = f.iso;
            }
            if (result.effectiveDate && result.doe) break;
        }
    }

    /* 7b) Date fallback — earliest non-DOB = effective, latest = expiry */
    if (!result.effectiveDate || !result.doe) {
        const dates = [];
        for (const line of lines) {
            for (const m of line.toUpperCase().matchAll(DATE_RE)) {
                const d = toISO(m[0]);
                if (d && !dates.includes(d) && d !== result.dob) dates.push(d);
            }
        }
        dates.sort();
        if (dates.length >= 2) {
            if (!result.effectiveDate) result.effectiveDate = dates[0];
            if (!result.doe) result.doe = dates[dates.length - 1];
        } else if (dates.length === 1) {
            if (!result.effectiveDate) result.effectiveDate = dates[0];
        }
    }

    /* 8) Normalize + sanity */
    result.dob = toISO(result.dob);
    result.effectiveDate = toISO(result.effectiveDate);
    result.doe = toISO(result.doe);
    if (result.effectiveDate && result.doe && result.effectiveDate > result.doe) {
        const t = result.effectiveDate; result.effectiveDate = result.doe; result.doe = t;
    }
    result.memberName = titleCase(result.memberName);
    const nameTokens = result.memberName ? result.memberName.split(/\s+/) : [];
    result.firstName = nameTokens[0] || '';
    result.lastName = nameTokens.slice(1).join(' ') || '';
    // Ensure insuranceType is set (fallback to GENERAL if still empty)
    if (!result.insuranceType) result.insuranceType = 'GENERAL';
    // Fill any missing critical fields with placeholder values to avoid blanks
    const placeholder = 'UNKNOWN';
    if (!result.policyNo) result.policyNo = placeholder;
    if (!result.provider) result.provider = placeholder;
    if (!result.memberName) result.memberName = placeholder;
    if (!result.groupNo) result.groupNo = placeholder;
    if (!result.effectiveDate) result.effectiveDate = placeholder;
    if (!result.dob) result.dob = placeholder;
    if (!result.doe) result.doe = placeholder;
    console.log('[PARSER] Insurance result (with defaults applied):', JSON.stringify(result, null, 2));
    return result;
}
/* =========================================================
   OCR HELPERS — sab safeOcr use karte hain
========================================================= */
const hasMrzText = (t) => String(t || '').split(/\r?\n/)
    .some(l => l.replace(/[^A-Za-z0-9<«]/g, '').length >= 36 && /<|«/.test(l))
    || /P</.test(t || '');

function scoreOcrText(t) {
    if (!t) return -1000;
    let s = 0;
    if (/P<[A-Z]{3}/.test(t)) s += 100;
    if (/<{5,}/.test(t)) s += 30;
    s += (t.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g) || []).length * 15;
    s += Math.min(50, t.length / 100);
    return s;
}

async function ocrBestRotation(filePath, currentText) {
    let best = { text: currentText || '', score: scoreOcrText(currentText) };
    // Already good quality — skip rotation attempts
    if (best.score >= 50) {
        console.log(`[OCR] Rotation rescue skipped — initial score already good (${best.score})`);
        return best.text;
    }
    for (const angle of [90, 270, 180]) {
        try {
            const buf = await sharp(filePath).rotate(angle).greyscale().normalize().png().toBuffer();
            const data = await safeOcr(buf);
            const t = (data.text || '').trim(), sc = scoreOcrText(t);
            if (sc > best.score) {
                console.log(`[OCR] rotation ${angle}° wins (score ${sc} > ${best.score})`);
                best = { text: t, score: sc };
                // Stop if we found a clearly good result
                if (sc >= 80) break;
            }
        } catch (e) { console.warn(`[OCR] rotation ${angle} failed:`, e.message); }
    }
    return best.text;
}

async function ocrMrzStrip(filePath) {
    try {
        const meta = await sharp(filePath).metadata();
        const h = Math.max(60, Math.round((meta.height || 0) * 0.30));
        const buf = await sharp(filePath)
            .extract({ left: 0, top: Math.max(0, (meta.height || h) - h), width: meta.width || 1, height: h })
            .resize({ width: 1400 }).greyscale().normalize().sharpen().png().toBuffer();
        // Persistent worker reuse karo — naya worker banana avoid karo
        const data = await safeOcr(buf);
        return data.text || '';
    } catch (e) { console.warn('[OCR] MRZ strip failed:', e.message); return ''; }
}

async function ocrDetailPass(filePath) {
    try {
        const buf = await sharp(filePath)
            .resize({ width: 1500, withoutEnlargement: false }) // 1800→1500
            .greyscale()
            .linear(1.4, -40)
            .sharpen({ sigma: 1.2 })
            .png()
            .toBuffer();
        const data = await safeOcr(buf);
        console.log('[OCR] Detail pass completed');
        return (data.text || '').trim();
    } catch (e) { console.warn('[OCR] detail pass failed:', e.message); return ''; }
}

const normLine = (l) => l.toUpperCase().replace(/[^A-Z0-9]/g, '');
function mergeNovelLines(baseText, extraText) {
    const baseSet = [...new Set(baseText.split(/\r?\n/).map(normLine).filter(Boolean))];
    const novel = extraText.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => {
        const n = normLine(l);
        if (n.length < 3) return false;
        return !baseSet.some(b => b === n || b.includes(n) || n.includes(b));
    });
    return novel.length ? baseText + '\n' + novel.join('\n') : baseText;
}

/* Full image pipeline — PDF GUARD ke saath */
async function ocrImageFile(filePath, originalName) {
    /* ★ Double guard: PDF yahan kabhi nahi pahunchne chahiye */
    if (isPdfFile(filePath)) {
        console.log('[OCR] ocrImageFile ko PDF mila — scanned-PDF handler pe route kar raha hoon');
        return ocrScannedPdf(filePath);
    }

    console.log('[OCR] Running Tesseract OCR on:', originalName || filePath);

    let imageBuffer;
    try {
        const fileBuf = fs.readFileSync(filePath);
        if (ENABLE_OCR_PREPROCESS) {
            try {
                imageBuffer = await preprocessImage(fileBuf, OCR_PREPROCESS_OPTIONS);
            } catch (prepErr) {
                console.warn('[OCR] Preprocess failed, falling back to raw image:', prepErr.message);
                imageBuffer = await sharp(fileBuf).greyscale().normalize().sharpen().png().toBuffer();
            }
        } else {
            imageBuffer = await sharp(fileBuf).greyscale().normalize().sharpen().png().toBuffer();
        }
    } catch (err) {
        console.warn('[OCR] File read or processing failed:', err.message);
        return '';
    }


    // Persistent worker — no logger to avoid slow path
    const data = await safeOcr(imageBuffer);

    let finalText = (data.text || '').trim();
    console.log(`[OCR] Tesseract extracted ${finalText.length} chars`);

    if (finalText.replace(/\s/g, '').length < 40) {
        console.log('[OCR] Very little text detected — trying rotation rescue');
        finalText = await ocrBestRotation(filePath, finalText);
    }

    const passportish = /PASSPORT|PASSEPORT|PASAPORTE|REPUBLIC|KINGDOM|MRZ|BAILIWICK/i.test(finalText)
        || finalText.replace(/\s/g, '').length < 200;
    /* ★ Insurance docs bhi detail pass ke haqdaar — chhota print hota hai */
    const insuranceish = /INSURANCE|ASSURANCE|POLICY|PREMIUM|INSURED|COVERAGE|EFFECTIVE|BIMA|POLISY|POUCY|POLCY/i.test(finalText);
    const needsDetail = passportish && !insuranceish;


    if (passportish && !insuranceish && !hasMrzText(finalText)) {
        const strip = await ocrMrzStrip(filePath);
        if (strip && hasMrzText(strip)) {
            console.log('[OCR] MRZ recovered from bottom-strip pass');
            finalText = finalText + '\n' + strip;
        }
    }

    if (needsDetail) {
        const hasIssueLabel = /ISSUE|WYDANIA|DELIV|EFFECTIVE|VALID|PERIOD|COMMENCE/i.test(finalText);
        const dateCount = (finalText.match(/\d{1,2}[\/\-. ]\s*[A-Z]{3,9}[\/\-. ]\s*\d{2,4}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g) || []).length;
        if (!hasIssueLabel || dateCount < 2) {
            console.log('[OCR] Issue-date/dates missing — running detail (upscaled) pass');
            const detail = await ocrDetailPass(filePath);
            if (detail) finalText = mergeNovelLines(finalText, detail);
        }
    }

    return finalText;
}

/* Backup engine: pdf-to-img (pure JS, prebuilt binaries) */
async function ocrPdfViaPdfToImg(filePath) {
    const { pdf } = pdfToImg;
    const document = await pdf(filePath, { scale: 2 }); // 3→2: render time half, OCR quality same
    const texts = [];
    let i = 0;
    for await (const img of document) {
        i++;
        const pagePath = path.join(UPLOAD_DIR, `p2i_${Date.now()}_${i}.png`);
        fs.writeFileSync(pagePath, img);
        console.log(`[OCR] pdf-to-img: page ${i} rendered`);
        const t = await ocrImageFile(pagePath, `page-${i}.png`);
        texts.push(t);
        try { fs.unlinkSync(pagePath); } catch (_) { }
    }
    return texts.filter(Boolean).join('\n\n');
}

/* Scanned PDF → pages render → har page OCR. Engine 1: poppler, Engine 2: pdf-to-img */
async function ocrScannedPdf(filePath) {
    let text = '';

    // Engine 1: pdf-poppler
    if (pdfPoppler) {
        const outDir = path.join(UPLOAD_DIR, 'pdfpages_' + Date.now());
        fs.mkdirSync(outDir, { recursive: true });
        try {
            await pdfPoppler.convert(filePath, {
                format: 'png',
                scale: 2,   // 4 se 2 — render time ~4x faster, quality still OCR-worthy
                out_dir: outDir,
                out_prefix: 'pg',
            });
            const pages = fs.readdirSync(outDir)
                .filter(f => f.startsWith('pg') && f.toLowerCase().endsWith('.png'))
                .sort((a, b) => (parseInt(a.replace(/\D/g, '')) || 0) - (parseInt(b.replace(/\D/g, '')) || 0));
            console.log(`[OCR] pdf-poppler: ${pages.length} page(s) rendered`);
            const texts = [];
            for (const p of pages) {
                const pagePath = path.join(outDir, p);
                texts.push(await ocrImageFile(pagePath, p));
                try { fs.unlinkSync(pagePath); } catch (_) { }
            }
            text = texts.filter(Boolean).join('\n\n');
        } catch (e) {
            console.warn('[OCR] pdf-poppler failed:', e.message);
        } finally {
            try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) { }
        }
    } else {
        console.warn('[OCR] pdf-poppler not loaded — trying pdf-to-img engine');
    }

    // Engine 2 fallback:   pdf-to-img
    if ((!text || text.length < 20) && pdfToImg) {
        console.log('[OCR] Falling back to pdf-to-img engine');
        try {
            text = await ocrPdfViaPdfToImg(filePath);
        } catch (e) {
            console.warn('[OCR] pdf-to-img also failed:', e.message);
        }
    }

    return text;
}

// Score OCR text to pick best engine
function scoreOcrText(t) {
    if (!t) return -Infinity;
    let score = 0;
    if (/P<[A-Z]{3}/.test(t)) score += 100;
    if (/[0-9A-Z<]{9}[0-9<][A-Z]{3}[0-9A-Z<]{6}/.test(t)) score += 80;
    const dateMatches = t.match(/\d{1,2}[\/\-\.][\d{1,2}[\/\-\.][\d{2,4}]/g);
    if (dateMatches) score += dateMatches.length * 15;
    const noise = (t.match(/[{}\[\]~`_]/g) || []).length;
    score -= noise * 2;
    return score;
}

async function extractEmbeddedPdfText(filePath) {
    if (!pdfParse) return '';
    const buf = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buf);
    return (pdfData.text || '').trim();
}

async function ocrPdfWithBestEngine(filePath) {
    // Try poppler first — agar achha result mila to pdf-to-img skip karo
    if (pdfPoppler) {
        try {
            const txt = await ocrScannedPdf(filePath);
            const sc = scoreOcrText(txt);
            console.log(`[OCR] poppler engine score=${sc}`);
            if (txt && sc >= 20) {
                console.log('[OCR] poppler result sufficient — skipping pdf-to-img engine');
                return txt;
            }
            // poppler ne thoda text diya — pdf-to-img se try karo
            if (pdfToImg) {
                try {
                    console.log('[OCR] poppler score low — trying pdf-to-img fallback');
                    const txt2 = await ocrPdfViaPdfToImg(filePath);
                    const sc2 = scoreOcrText(txt2);
                    console.log(`[OCR] pdf-to-img engine score=${sc2}`);
                    return sc2 > sc ? txt2 : (txt || txt2);
                } catch (e) { console.warn('[OCR] pdf-to-img fallback failed:', e.message); }
            }
            return txt;
        } catch (e) { console.warn('[OCR] poppler OCR failed:', e.message); }
    }
    // poppler nahi hai — directly pdf-to-img
    if (pdfToImg) {
        try {
            const txt = await ocrPdfViaPdfToImg(filePath);
            console.log(`[OCR] pdf-to-img engine score=${scoreOcrText(txt)}`);
            return txt;
        } catch (e) { console.warn('[OCR] pdf-to-img OCR failed:', e.message); }
    }
    return '';
}
/* MAIN ENTRY — magic-byte based routing */
async function extractTextFromFile(filePath, originalName) {
    const nameIsPdf = String(originalName || '').toLowerCase().endsWith('.pdf');
    const fileIsPdf = isPdfFile(filePath);

    if (nameIsPdf || fileIsPdf) {
        console.log('[OCR] PDF detected');
        const embedded = await extractEmbeddedPdfText(filePath);
        const needsOcr = FORCE_OCR_FOR_PDF || !embedded || embedded.length < 300;
        if (!needsOcr && embedded) {
            console.log('[OCR] Using embedded PDF text (no OCR needed)');
            try { fs.writeFileSync(path.join(__dirname, 'ocr_last.txt'), embedded); } catch (_) { }
            return embedded;
        }
        console.log('[OCR] Embedded text insufficient — using best OCR engine');
        // ocrPdfWithBestEngine already tries fallback internally — no need to call ocrScannedPdf again
        const finalText = await ocrPdfWithBestEngine(filePath);
        try { fs.writeFileSync(path.join(__dirname, 'ocr_last.txt'), finalText); } catch (_) { }
        return finalText;
    }
    // Fallback OCR for non-PDF files
    const finalText = await ocrImageFile(filePath, originalName);
    try { fs.writeFileSync(path.join(__dirname, 'ocr_last.txt'), finalText); } catch (_) { }
    return finalText;
}


/* =========================================================
   DOC TYPE AUTO-DETECT
========================================================= */
function detectDocType(text) {
    const t = String(text || '').toUpperCase();
    const passportScore = (t.match(/P<[A-Z]{3}/g) || []).length * 5
        + (t.includes('PASSPORT') ? 3 : 0)
        + (t.match(/<{5,}/g) || []).length;
    const insKeywords = [
        'POLICY', 'INSURANCE', 'PREMIUM', 'INSURED', 'EFFECTIVE', 'COVERAGE',
        'MEMBER', 'BIMA', 'ASSURANCE', 'POUCY', 'POLISY', 'POLCY',
        'HEALTH', 'MEDICLAIM', 'MEDICAL', 'MOTOR', 'AUTO', 'VEHICLE', 'LIFE', 'TERM'
    ];
    const insScore = insKeywords.reduce((s, k) => s + (t.includes(k) ? 2 : 0), 0);
    return insScore > passportScore ? 'INSURANCE' : 'PASSPORT';
}

/* =========================================================
   DB (JSON)
========================================================= */
const DB_PATH = path.join(__dirname, 'data', 'passports.json');

function loadDB() { 
    try {
        if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) { console.warn('[DB] Load error:', e.message); }
    return [];
}

function saveDB(records) {
    try {
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2));
    } catch (e) { console.warn('[DB] Save error:', e.message); }
}

let dbRecords = loadDB();

/* =========================================================
   API ROUTES
========================================================= */


app.put('/api/passports/:id', (req, res) => {
    const idx = dbRecords.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Record not found' });
    dbRecords[idx] = { ...dbRecords[idx], ...req.body, id: req.params.id };
    saveDB(dbRecords);
    res.json({ success: true, record: dbRecords[idx] });
});

// GET all passports
app.get('/api/passports', (req, res) => {
    res.json(dbRecords);
});

    // Create a new passport record
    app.post('/api/passports', (req, res) => {
        const newRecord = { id: Date.now().toString(), ...req.body };
        dbRecords.push(newRecord);
        saveDB(dbRecords);
        res.json({ success: true, record: newRecord });
    });

app.delete('/api/passports/:id', (req, res) => {
    const initialLen = dbRecords.length;
    dbRecords = dbRecords.filter(r => r.id !== req.params.id);
    if (dbRecords.length === initialLen) return res.status(404).json({ success: false, message: 'Record not found' });
    saveDB(dbRecords);
    res.json({ success: true });
});

app.get('/api/export/csv', (req, res) => {
    const cols = ['id', 'docType', 'passportNo', 'firstName', 'lastName', 'surname', 'givenNames',
        'nationality', 'issuingCountry', 'sex', 'dob', 'doe', 'issueDate', 'placeOfBirth', 'placeOfIssue',
        'address', 'fatherName', 'motherName', 'spouseName', 'oldPassportNo', 'fileNo',
        'insuranceType', 'policyNo', 'provider', 'memberName', 'groupNo', 'effectiveDate',
        'phone', 'email', 'healthCardNo', 'tpa', 'networkHospital', 'sumInsured', 'copayPercentage',
        'roomRentLimit', 'hospitalizationLimit', 'waitingPeriod', 'preExistingDisease', 'vehicleNo',
        'registrationNo', 'vehicleType', 'make', 'model', 'variant', 'manufacturingYear', 'chassisNo',
        'engineNo', 'idv', 'ncb', 'fuelType', 'lifeAssured', 'nomineeName', 'maturityDate',
        'deathBenefit', 'maturityBenefit', 'premium', 'policyTermYears', 'travelStartDate',
        'travelEndDate', 'destination', 'departureCountry', 'arrivalCountry', 'tripType',
        'travellerCount', 'createdAt'];
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [cols.join(',')].concat(dbRecords.map(r => cols.map(c => esc(r[c])).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registry_export.csv"');
    res.send(rows.join('\n'));
});

app.get('/api/export/json', (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registry_export.json"');
    res.send(JSON.stringify(dbRecords, null, 2));
});

function applyProperNameHandling(data, finalType) {
    if (finalType === 'PASSPORT' && data.mrz?.nameLine) {
        try {
            // Extract the name segment before MRZ field separator "<<"
            const nameSection = data.mrz.nameLine.split('<<')[0];
            const cleaned = nameSection
                .replace(/^P<?[A-Z]{3}/, '')
                .replace(/<+/g, ' ')
                .trim();
            const tokens = cleaned.split(/\s+/).filter(Boolean);
            let surname = '';
            let givenNames = '';
            if (tokens.length >= 2) {
                // Normal case: first token is surname, rest are given names
                surname = tokens[0];
                givenNames = tokens.slice(1).join(' ');
            } else if (tokens.length === 1) {
                // Heuristic: split on double 'SS' which may separate concatenated surname and given name
                const parts = tokens[0].split(/SS/);
                if (parts.length === 2) {
                    surname = parts[0];
                    givenNames = parts[1];
                } else {
                    surname = tokens[0];
                }
            }
            // Populate fields
            data.surname = surname;
            data.givenNames = givenNames;
            // Also set firstName/lastName for convenience
            data.firstName = givenNames;
            data.lastName = surname;
            console.log('[DEBUG] Proper name extraction applied for passport:', { surname, givenNames });
        } catch (e) {
            console.warn('[WARN] Proper name handling failed for passport:', e.message);
        }
    } else if (finalType === 'INSURANCE' && data.memberName) {
        try {
            const tokens = data.memberName.split(/\s+/).filter(Boolean);
            let firstName = '';
            let lastName = '';
            if (tokens.length >= 2) {
                firstName = tokens[0];
                lastName = tokens.slice(1).join(' ');
            } else {
                firstName = tokens[0] || '';
            }
            // Populate fields
            data.firstName = firstName;
            data.lastName = lastName;
            // Also map to givenNames/surname for consistency
            data.givenNames = firstName;
            data.surname = lastName;
            console.log('[DEBUG] Proper name extraction applied for insurance:', { firstName, lastName });
        } catch (e) {
            console.warn('[WARN] Proper name handling failed for insurance:', e.message);
        }
    }
}
// In-memory store for scanned passport results
const passportStore = [];
app.post('/api/scan', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    try {
        const externalParser = require('./parser.js');
        const requested = (req.body.docType || 'AUTO').toUpperCase();
        const rawText = await extractTextFromFile(req.file.path, req.file.originalname);
        const finalType = requested === 'AUTO' ? detectDocType(rawText) : requested;
        let data = finalType === 'INSURANCE'
            ? await externalParser.parseInsuranceText(rawText)
            : await externalParser.parsePassportText(rawText);
        if (!data) {
            console.warn('[SCAN] Parser returned undefined, initializing empty object');
            data = {};
        }
        data.docType = finalType;

        // ---- Proper name handling (enhanced) ----
        applyProperNameHandling(data, finalType);

        const previewUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(req.file.path)}`;
        passportStore.push({ data, rawText, previewUrl, fileName: req.file.originalname });
        res.json({ success: true, data, previewUrl, fileName: req.file.originalname });
    } catch (err) {
        console.error('[SCAN] failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ------------------------------------------------------------
// MULTI-FILE SCAN endpoint – processes array of uploaded files
// ------------------------------------------------------------
app.post('/api/scan-multi', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });
    const requested = (req.body.docType || 'AUTO').toUpperCase();
    const results = [];
    for (const f of req.files) {
        try {
            const rawText = await extractTextFromFile(f.path, f.originalname);
            const externalParser = require('./parser.js');
            const finalType = requested === 'AUTO' ? detectDocType(rawText) : requested;
            let data = finalType === 'INSURANCE'
                ? await externalParser.parseInsuranceText(rawText)
                : await externalParser.parsePassportText(rawText);

            if (!data) data = {};
            data.docType = finalType;

            // Apply proper name handling
            applyProperNameHandling(data, finalType);

            results.push({
                success: true,
                fileName: f.originalname,
                data,
                rawText,
                previewUrl: `${req.protocol}://${req.get('host')}/uploads/${path.basename(f.path)}`,
            });
        } catch (err) {
            console.error('[SCAN-MULTI] file error:', f.originalname, err.message);
            results.push({ success: false, message: err.message, fileName: f.originalname, data: {}, rawText: '', previewUrl: '' });
        }
    }
    res.json({ success: true, results });
});

// ---------------------------------------------------
// New endpoint: return a short snippet of PDF text
app.post('/api/scan/snippet', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const maxLen = parseInt(req.body.length) || 200; // default 200 characters
    try {
        const rawText = await extractTextFromFile(req.file.path, req.file.originalname);
        const snippet = rawText.slice(0, maxLen);
        const previewUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(req.file.path)}`;
        res.json({ success: true, snippet, rawText, previewUrl, fileName: req.file.originalname });
    } catch (err) {
        console.error('[SCAN SNIPPET] failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ---------------------------------------------------
// GET /api/passports – return all scanned records
// ---------------------------------------------------
app.get('/api/passports', (req, res) => {
    res.json({ success: true, data: passportStore });
});

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

// Graceful server start with automatic port fallback
const DEFAULT_PORT = 5058;      // base port if none provided
const MAX_PORT = 5100;          // upper limit for attempts
const requestedPort = process.env.PORT ? parseInt(process.env.PORT, 10) : DEFAULT_PORT;

function startServer(port) {
    const server = app.listen(port, () => console.log(`[SERVER] Running on http://localhost:${port}`));
    server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
            if (port < MAX_PORT) {
                console.warn(`[FATAL-GUARD] Port ${port} in use – trying ${port + 1}`);
                startServer(port + 1);
            } else {
                console.error(`[FATAL-GUARD] No free port found between ${DEFAULT_PORT} and ${MAX_PORT}. Exiting.`);
                process.exit(1);
            }
        } else {
            console.error(`[FATAL-GUARD] Server failed to start on port ${port}:`, err);
            process.exit(1);
        }
    });
}

startServer(requestedPort);