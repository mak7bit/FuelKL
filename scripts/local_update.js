// scripts/local_update.js
// Node 18+ (ES modules). Produces a district-mapped prices.json.
// Usage locally:
// $env:RAPIDAPI_KEY="..." ; $env:SOURCE_URL="https://.../history/india/kerala/{district}" ; node scripts/local_update.js
// In GitHub Actions: set RAPIDAPI_KEY secret and SOURCE_URL secret (with {district}).

import fs from 'fs/promises';

const RAPIDAPI_HOST = 'daily-petrol-diesel-lpg-cng-fuel-prices-in-india.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const SOURCE_TEMPLATE = process.env.SOURCE_URL || 'https://daily-petrol-diesel-lpg-cng-fuel-prices-in-india.p.rapidapi.com/v1/fuel-prices/history/india/kerala/{district}';

if (!RAPIDAPI_KEY) {
  console.error('RAPIDAPI_KEY not set. Exiting.');
  process.exit(1);
}

// list of district slugs you want in the UI (default includes Palakkad)
const DISTRICTS = [
  "alappuzha",
  "kakkanad",
  "kalpetta",
  "kannur",
  "kasaragod",
  "kollam",
  "kottayam",
  "kozhikode",
  "malappuram",
  "palakkad",
  "pandakkal",
  "pathanamthitta",
  "thrissur",
  "trivandrum"
];


// Heuristic extractor (re-usable)
function extractPricesFromResponse(data) {
  // If flat object with petrol/diesel
  if (data && typeof data.petrol === 'number' && typeof data.diesel === 'number') {
    return { petrol: Number(data.petrol), diesel: Number(data.diesel), updated_at: data.updated_at || new Date().toISOString() };
  }

  // If array, take last element then try again
  if (Array.isArray(data) && data.length) {
    const cand = data[data.length - 1];
    if (cand && (cand.petrol || cand.diesel)) {
      return {
        petrol: Number(cand.petrol || cand.petrol_price || cand.petrolPrice || 0),
        diesel: Number(cand.diesel || cand.diesel_price || cand.dieselPrice || 0),
        updated_at: cand.updated_at || cand.updated || new Date().toISOString()
      };
    }
  }

  // Deep scan for common keys
  function scan(o) {
    if (!o || typeof o !== 'object') return {};
    for (const k of Object.keys(o)) {
      const lk = k.toLowerCase();
      if ((lk.includes('petrol') || lk === 'p') && !isNaN(Number(o[k]))) {
        // try to find diesel sibling
        const dieselKey = Object.keys(o).find(x => x.toLowerCase().includes('diesel') || x === 'd');
        const dieselVal = dieselKey ? Number(o[dieselKey]) : undefined;
        return {
          petrol: Number(o[k]),
          diesel: dieselVal,
          updated_at: o.updated_at || o.updated || new Date().toISOString()
        };
      }
      if (typeof o[k] === 'object') {
        const sub = scan(o[k]);
        if (sub.petrol && sub.diesel) return sub;
      }
    }
    return {};
  }

  const found = scan(data);
  if (found.petrol && found.diesel) return found;

  // fallback: try to parse numbers from JSON string
  const s = JSON.stringify(data);
  const nums = s.match(/(\d{2,3}\.\d{1,2})/g) || [];
  if (nums.length >= 2) {
    return { petrol: Number(nums[0]), diesel: Number(nums[1]), updated_at: new Date().toISOString() };
  }

  return null;
}

async function fetchForDistrict(district) {
  const url = SOURCE_TEMPLATE.replace('{district}', district);
  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) {
      console.warn(`Fetch ${district} returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    const normalized = extractPricesFromResponse(data);
    if (!normalized) {
      console.warn('Could not parse response for', district, 'sample:', JSON.stringify(data).slice(0,800));
      return null;
    }
    return normalized;
  } catch (err) {
    console.warn('Fetch error for', district, err.message || err);
    return null;
  }
}

async function run() {
  const out = {};
  for (const d of DISTRICTS) {
    const res = await fetchForDistrict(d);
    if (res) {
      out[d] = res;
      console.log(`fetched ${d}: petrol=${res.petrol}, diesel=${res.diesel}`);
    } else {
      console.log(`no data for ${d}`);
    }
  }

  // If out is empty, try fallback: fetch TEMPLATE with palakkad and write flat form
  if (Object.keys(out).length === 0) {
    console.error('No district data fetched. Attempting fallback single fetch (palakkad).');
    const fallback = await fetchForDistrict('palakkad');
    if (fallback) {
      await fs.writeFile('prices.json', JSON.stringify(fallback, null, 2), 'utf8');
      console.log('Wrote flat prices.json (fallback).');
      return;
    } else {
      console.error('Fallback failed. Exiting with error.');
      process.exit(2);
    }
  }

  // write district-mapped JSON
  await fs.writeFile('prices.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote district-mapped prices.json with', Object.keys(out).length, 'districts.');
}

run();
