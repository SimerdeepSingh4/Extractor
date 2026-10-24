const { OpenAI } = require('openai');
const { OPENAI, ENABLE_IDP } = require('./config/idp.config');

const KEYS = {
    PASSPORT: ['passportNo', 'surname', 'givenNames', 'nationality', 'sex', 'dob', 'issueDate', 'doe', 'issuingCountry', 'address', 'fatherName', 'motherName', 'spouseName', 'oldPassportNo', 'fileNo', 'placeOfIssue', 'placeOfBirth'],
    INSURANCE: ['insuranceType', 'policyNo', 'provider', 'memberName', 'groupNo', 'effectiveDate', 'dob', 'doe', 'phone', 'email', 'address', 'healthCardNo', 'tpa', 'networkHospital', 'sumInsured', 'copayPercentage', 'roomRentLimit', 'hospitalizationLimit', 'waitingPeriod', 'preExistingDisease', 'vehicleNo', 'registrationNo', 'vehicleType', 'make', 'model', 'variant', 'manufacturingYear', 'chassisNo', 'engineNo', 'idv', 'ncb', 'fuelType', 'lifeAssured', 'nomineeName', 'maturityDate', 'deathBenefit', 'maturityBenefit', 'premium', 'policyTermYears', 'travelStartDate', 'travelEndDate', 'destination', 'departureCountry', 'arrivalCountry', 'tripType', 'travellerCount'],
};

function buildPrompt(docType, rawText) {
    return `You are an expert document data extraction engine.
Extract data from raw OCR text of a ${docType} document.

RULES:
- If MRZ lines (long lines of A-Z, 0-9 and '<') exist, they are the MOST reliable source — prefer them.
- Dates MUST be YYYY-MM-DD. Convert from DD/MM/YYYY, DD MMM YYYY etc. as needed.
- nationality and issuingCountry MUST be ISO 3166-1 alpha-3 codes (e.g. IND, USA, GBR, HTI).
- sex MUST be "M" or "F".
- Never guess or invent values. If a field is not visible, return "".
- Respond with ONLY a JSON object with exactly these keys: ${KEYS[docType].join(', ')}

OCR TEXT:
"""
 ${String(rawText).slice(0, 6000)}
"""`;
}

/* Gap-filler: extracts fields from OCR text via LLM.
   Parser merges results only into EMPTY fields (never overwrites MRZ). */
async function processDocument(docType, rawText) {
    if (!ENABLE_IDP || !OPENAI.apiKey || !rawText || rawText.trim().length < 15) return {};
    try {
        const client = new OpenAI({ apiKey: OPENAI.apiKey });
        const completion = await client.chat.completions.create({
            model: OPENAI.model,
            temperature: 0,
            messages: [{ role: 'user', content: buildPrompt(docType, rawText) }],
        });
        let content = (completion?.choices?.[0]?.message?.content || '').trim();
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start === -1 || end === -1 || end < start) {
            console.error('[IDP] returned non-JSON:', content);
            return {};
        }
        const obj = JSON.parse(content.slice(start, end + 1));
        const out = {};
        for (const k of KEYS[docType]) {
            if (obj[k] != null && String(obj[k]).trim() !== '') out[k] = String(obj[k]).trim();
        }
        return out;
    } catch (err) {
        console.error('[IDP] LLM extraction failed:', err.message);
        return {};
    }   
}

module.exports = { processDocument };