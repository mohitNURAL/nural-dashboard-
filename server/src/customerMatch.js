// Finds the customer name for a deal that has none, from the lead it came from
// or another lead for the same company. Used to suggest a Contact in the Error
// List; nothing is written until a Pipeline admin applies the suggestion.

const LEGAL_WORDS = /\b(pvt|private|ltd|limited|llp|inc|co|company|india|technologies|technology|the)\b/g;

/** "Reicuri Pvt. Ltd." and "Reicuri Private Limited" → "reicuri". */
export function companyKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(LEGAL_WORDS, ' ')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Lead name fields are preferred; a name found only in a lead's title is
 * returned with fromTitle: true — shown as a pointer for the team to fix in
 * Bitrix24, never applied automatically.
 * @returns {{ leadId: string, name: string, reason: 'linked lead'|'same company', alternatives: number, fromTitle: boolean } | null}
 */
export function suggestCustomer(deal, model) {
  const linked = deal.leadId ? model.leads.find((l) => l.id === deal.leadId) : null;
  const key = companyKey(deal.company);
  const sameCompany = key ? model.leads.filter((l) => companyKey(l.company) === key || companyKey(l.title) === key) : [];
  // The lead that was converted is the best evidence; otherwise the most recent.
  const rank = (a, b) => (b.bucket === 'converted') - (a.bucket === 'converted') || (b.createdAt ?? 0) - (a.createdAt ?? 0);

  for (const field of ['personName', 'titleName']) {
    const fromTitle = field === 'titleName';
    if (linked?.[field]) return { leadId: linked.id, name: linked[field], reason: 'linked lead', alternatives: 0, fromTitle };
    const candidates = sameCompany.filter((l) => l[field]).sort(rank);
    if (!candidates.length) continue;
    const top = candidates[0][field].toLowerCase();
    const otherNames = new Set(candidates.slice(1).map((l) => l[field].toLowerCase()).filter((n) => n !== top));
    return { leadId: candidates[0].id, name: candidates[0][field], reason: 'same company', alternatives: otherNames.size, fromTitle };
  }
  return null;
}
