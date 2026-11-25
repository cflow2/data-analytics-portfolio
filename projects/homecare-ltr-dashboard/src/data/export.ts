import * as XLSX from 'xlsx';

export type Cell = string | number | null | undefined;
export interface TableData { columns: string[]; rows: Cell[][] }

function csvEscape(v: Cell): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: TableData): string {
  return [t.columns, ...t.rows].map((r) => r.map(csvEscape).join(',')).join('\n');
}

export function toTsv(t: TableData): string {
  return [t.columns, ...t.rows].map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v).replace(/[\t\n]/g, ' '))).join('\t')).join('\n');
}

export function downloadBlob(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(name: string, t: TableData) {
  downloadBlob(name.endsWith('.csv') ? name : `${name}.csv`, '﻿' + toCsv(t), 'text/csv;charset=utf-8');
}

export function downloadXlsx(name: string, t: TableData, sheet = 'Data') {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.columns, ...t.rows]), sheet.slice(0, 31));
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  downloadBlob(name.endsWith('.xlsx') ? name : `${name}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

/** Copy formatted HTML (pastes into Outlook with bold, italics and bullets) with a plain-text fallback. */
export async function copyHtml(html: string, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    return true;
  } catch {
    // Older browsers: select a rendered copy and use the legacy copy command, which keeps formatting.
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    div.innerHTML = html;
    document.body.appendChild(div);
    const range = document.createRange(); range.selectNodeContents(div);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    const ok = document.execCommand('copy');
    sel?.removeAllRanges(); div.remove();
    return ok || copyText(text);
  }
}

/** Copy a PNG data URL to the clipboard; falls back to downloading it. */
export async function copyPng(dataUrl: string, fallbackName: string): Promise<'copied' | 'downloaded'> {
  const blob = await (await fetch(dataUrl)).blob();
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'copied';
  } catch {
    downloadBlob(`${fallbackName}.png`, blob, 'image/png');
    return 'downloaded';
  }
}
