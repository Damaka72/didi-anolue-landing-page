/**
 * Didi Anolue Consulting — Agent Data API
 * GET /api/agent-data
 *
 * Reads JSON summaries written by the didi-agents CLI tools
 * and returns a unified payload for the admin dashboard.
 *
 * Agents write their summaries to data/agent-summaries/:
 *   scout.json        outreach.json     cv-tailor.json
 *   packages.json     social.json       curator.json
 *   newsletter.json   seo.json          health.json
 *   enquiry.json      repurpose.json
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function readSummary(filename) {
  const p = join(process.cwd(), 'data', 'agent-summaries', filename);
  if (!existsSync(p)) return { status: 'never_run' };
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return { status: 'error' };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (ADMIN_PASSWORD) {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace('Bearer ', '');
    if (token !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorised' });
    }
  }

  return res.status(200).json({
    // Pipeline agents
    scout:     readSummary('scout.json'),
    outreach:  readSummary('outreach.json'),
    cvTailor:  readSummary('cv-tailor.json'),
    packages:  readSummary('packages.json'),
    social:    readSummary('social.json'),
    // Content agents
    curator:   readSummary('curator.json'),
    newsletter: readSummary('newsletter.json'),
    repurpose: readSummary('repurpose.json'),
    // Site agents
    seo:       readSummary('seo.json'),
    health:    readSummary('health.json'),
    // Enquiry
    enquiry:   readSummary('enquiry.json'),
  });
}
