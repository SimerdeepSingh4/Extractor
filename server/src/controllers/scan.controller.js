const fs = require('fs');
const path = require('path');
const { extractTextFromFile } = require('../services/document-text.service');
const { detectDocType } = require('../services/document-type.service');
const { applyProperNameHandling } = require('../services/document-names.service');

function scheduleTempFileCleanup(filePath) {
    if (!filePath) return;
    setTimeout(() => {
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.warn('[CLEANUP] Failed to remove temp upload:', filePath, err.message);
            }
        });
    }, 15000);
}

async function scanDocument(req, res) {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    try {
        const externalParser = require('../parsers');
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
        scheduleTempFileCleanup(req.file.path);
        res.json({ success: true, data, previewUrl, fileName: req.file.originalname });
    } catch (err) {
        scheduleTempFileCleanup(req.file.path);
        console.error('[SCAN] failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function scanDocuments(req, res) {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });
    const requested = (req.body.docType || 'AUTO').toUpperCase();
    const results = [];
    for (const f of req.files) {
        try {
            const rawText = await extractTextFromFile(f.path, f.originalname);
            const externalParser = require('../parsers');
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
            scheduleTempFileCleanup(f.path);
        } catch (err) {
            scheduleTempFileCleanup(f.path);
            console.error('[SCAN-MULTI] file error:', f.originalname, err.message);
            results.push({ success: false, message: err.message, fileName: f.originalname, data: {}, rawText: '', previewUrl: '' });
        }
    }
    res.json({ success: true, results });
}

async function scanSnippet(req, res) {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const maxLen = parseInt(req.body.length) || 200; // default 200 characters
    try {
        const rawText = await extractTextFromFile(req.file.path, req.file.originalname);
        const snippet = rawText.slice(0, maxLen);
        const previewUrl = `${req.protocol}://${req.get('host')}/uploads/${path.basename(req.file.path)}`;
        scheduleTempFileCleanup(req.file.path);
        res.json({ success: true, snippet, rawText, previewUrl, fileName: req.file.originalname });
    } catch (err) {
        scheduleTempFileCleanup(req.file.path);
        console.error('[SCAN SNIPPET] failed:', err);
        res.status(500).json({ success: false, message: err.message });
    }
}

module.exports = { scanDocument, scanDocuments, scanSnippet };
