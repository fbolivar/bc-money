import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import './ImportarExtractos.css';

interface ParsedTransaction {
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    selected: boolean;
}

// Smart column detection - works with Colombian banks
function findColumnIndex(headers: string[], keywords: string[]): number {
    return headers.findIndex(h => keywords.some(k => h.includes(k)));
}

function parseDate(raw: unknown): string {
    if (!raw) return format(new Date(), 'yyyy-MM-dd');
    const s = String(raw).trim();

    // Excel serial date number
    if (/^\d{5}$/.test(s)) {
        const d = new Date((parseInt(s) - 25569) * 86400000);
        return format(d, 'yyyy-MM-dd');
    }

    // Try common formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY
    const parts = s.split(/[/\-.\s]/);
    if (parts.length >= 3) {
        const [a, b, c] = parts;
        if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
        if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
        if (c.length === 2) return `20${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    return format(new Date(), 'yyyy-MM-dd');
}

function parseAmount(raw: unknown): number {
    if (!raw) return 0;
    const s = String(raw).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    return Math.abs(parseFloat(s) || 0);
}

function parseRows(headers: string[], rows: unknown[][]): ParsedTransaction[] {
    const h = headers.map(x => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

    // Detect columns - support multiple naming conventions from Colombian banks
    const dateIdx = findColumnIndex(h, ['fecha', 'date', 'f.', 'dia']);
    const descIdx = findColumnIndex(h, ['desc', 'concepto', 'detalle', 'referencia', 'nombre', 'observ', 'movimiento']);
    const amountIdx = findColumnIndex(h, ['monto', 'valor', 'amount', 'importe', 'total']);
    const debitIdx = findColumnIndex(h, ['debito', 'cargo', 'retiro', 'salida', 'egreso']);
    const creditIdx = findColumnIndex(h, ['credito', 'abono', 'deposito', 'entrada', 'ingreso']);

    const results: ParsedTransaction[] = [];

    for (const row of rows) {
        let amount = 0;
        let type: 'income' | 'expense' = 'expense';

        if (debitIdx >= 0 && creditIdx >= 0) {
            const debit = parseAmount(row[debitIdx]);
            const credit = parseAmount(row[creditIdx]);
            if (credit > 0) { amount = credit; type = 'income'; }
            else if (debit > 0) { amount = debit; type = 'expense'; }
            else continue;
        } else if (amountIdx >= 0) {
            const rawVal = row[amountIdx];
            const numVal = parseAmount(rawVal);
            if (numVal === 0) continue;
            amount = numVal;
            // Check if negative in original
            const rawStr = String(rawVal || '');
            type = rawStr.startsWith('-') || rawStr.includes('(') ? 'expense' : 'income';
        } else {
            // Try to find any numeric column
            for (let i = 0; i < row.length; i++) {
                if (i === dateIdx || i === descIdx) continue;
                const v = parseAmount(row[i]);
                if (v > 0) { amount = v; type = 'expense'; break; }
            }
            if (amount === 0) continue;
        }

        const date = parseDate(dateIdx >= 0 ? row[dateIdx] : null);
        const description = descIdx >= 0 ? String(row[descIdx] || '').trim() : '';

        results.push({ date, description, amount, type, selected: true });
    }
    return results;
}

function parseCSV(text: string): ParsedTransaction[] {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Detect separator
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(l => l.split(sep).map(c => c.trim().replace(/"/g, '')));
    return parseRows(headers, rows);
}

function parseXLSX(buffer: ArrayBuffer): ParsedTransaction[] {
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Try each sheet until we find transactions
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length < 2) continue;

        // Find the header row (first row with multiple text cells)
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(data.length, 15); i++) {
            const row = data[i] as string[];
            const textCells = row.filter(c => c && typeof c === 'string' && c.length > 1).length;
            if (textCells >= 3) { headerRowIdx = i; break; }
        }

        const headers = (data[headerRowIdx] as string[]).map(c => String(c || ''));
        const rows = data.slice(headerRowIdx + 1).filter(r => (r as unknown[]).some(c => c !== null && c !== undefined && c !== ''));

        const results = parseRows(headers, rows as unknown[][]);
        if (results.length > 0) return results;
    }
    return [];
}

function parseOFX(text: string): ParsedTransaction[] {
    const results: ParsedTransaction[] = [];
    const txRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;
    while ((match = txRegex.exec(text)) !== null) {
        const block = match[1];
        const getVal = (tag: string) => { const m = block.match(new RegExp(`<${tag}>(.*?)(?:<|$)`, 'i')); return m ? m[1].trim() : ''; };
        const amount = parseFloat(getVal('TRNAMT') || '0');
        if (amount === 0) continue;
        const rawDate = getVal('DTPOSTED');
        const date = rawDate.length >= 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : format(new Date(), 'yyyy-MM-dd');
        results.push({ date, description: getVal('NAME') || getVal('MEMO') || '', amount: Math.abs(amount), type: amount > 0 ? 'income' : 'expense', selected: true });
    }
    return results;
}

export function ImportarExtractos() {
    const { user, profile } = useAuth();
    const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ count: number } | null>(null);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const currency = profile?.currency || 'COP';

    const handleFile = useCallback(async (file: File) => {
        setError('');
        setResult(null);
        setFileName(file.name);

        let txs: ParsedTransaction[] = [];
        const ext = file.name.toLowerCase().split('.').pop() || '';

        try {
            if (ext === 'xlsx' || ext === 'xls') {
                const buffer = await file.arrayBuffer();
                txs = parseXLSX(buffer);
            } else if (ext === 'ofx' || ext === 'qfx') {
                const text = await file.text();
                txs = parseOFX(text);
            } else {
                const text = await file.text();
                txs = parseCSV(text);
            }
        } catch (e) {
            setError(`Error al leer el archivo: ${e}`);
            return;
        }

        if (txs.length === 0) {
            setError('No se encontraron transacciones. Verifica que el archivo tenga columnas como Fecha, Concepto/Descripción, Monto/Valor o Débito/Crédito.');
            return;
        }
        setParsed(txs);
    }, []);

    const toggleSelect = (idx: number) => {
        setParsed(prev => prev.map((t, i) => i === idx ? { ...t, selected: !t.selected } : t));
    };

    const toggleAll = () => {
        const allSelected = parsed.every(t => t.selected);
        setParsed(prev => prev.map(t => ({ ...t, selected: !allSelected })));
    };

    const handleImport = async () => {
        if (!user) return;
        const selected = parsed.filter(t => t.selected);
        if (selected.length === 0) return;
        setImporting(true);
        let count = 0;
        for (const tx of selected) {
            const { error } = await supabase.from('transactions').insert({
                user_id: user.id, type: tx.type, amount: tx.amount,
                description: tx.description || null, date: tx.date, payment_method: 'other',
            });
            if (!error) count++;
        }
        setResult({ count });
        setImporting(false);
        setParsed([]);
    };

    const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);

    return (
        <div className="importar-page animate-fadeIn">
            <div className="imp-header">
                <div><h1>Importar Extractos</h1><p>Importa transacciones desde extractos bancarios colombianos</p></div>
            </div>

            {/* Supported Formats */}
            <div className="imp-formats">
                <div className="imp-format highlight"><FileSpreadsheet size={20} /><div><strong>Excel (XLSX / XLS)</strong><span>Bancolombia, Nequi, Banco de Bogotá, AV Villas, Davivienda, BBVA</span></div></div>
                <div className="imp-format"><FileText size={20} /><div><strong>CSV</strong><span>Archivos separados por comas, punto y coma o tabulador</span></div></div>
                <div className="imp-format"><FileText size={20} /><div><strong>OFX / QFX</strong><span>Open Financial Exchange (estándar internacional)</span></div></div>
            </div>

            {/* Upload Area */}
            {parsed.length === 0 && !result && (
                <div className="imp-upload" onClick={() => fileRef.current?.click()}>
                    <Upload size={48} />
                    <h3>Arrastra o selecciona tu extracto bancario</h3>
                    <p>Formatos: .xlsx, .xls, .csv, .ofx, .qfx</p>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ofx,.qfx" style={{ display: 'none' }}
                        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                </div>
            )}

            {error && <div className="imp-error"><AlertTriangle size={16} /> {error}</div>}

            {/* Preview */}
            {parsed.length > 0 && (
                <div className="imp-preview">
                    <div className="imp-preview-header">
                        <h3>{fileName} — {parsed.length} transacciones encontradas</h3>
                        <div className="imp-preview-actions">
                            <button type="button" className="btn btn-ghost" onClick={toggleAll}>Seleccionar/Deseleccionar</button>
                            <button type="button" className="btn btn-ghost" onClick={() => { setParsed([]); setFileName(''); }}><X size={16} /> Cancelar</button>
                        </div>
                    </div>

                    <div className="imp-table-wrap">
                        <table className="table">
                            <thead><tr><th style={{ width: 40 }}></th><th>Fecha</th><th>Descripción</th><th>Tipo</th><th className="text-right">Monto</th></tr></thead>
                            <tbody>
                                {parsed.map((tx, i) => (
                                    <tr key={i} className={tx.selected ? '' : 'deselected'}>
                                        <td><input type="checkbox" checked={tx.selected} onChange={() => toggleSelect(i)} /></td>
                                        <td>{tx.date}</td>
                                        <td>{tx.description || '—'}</td>
                                        <td><span className={`type-badge ${tx.type}`}>{tx.type === 'income' ? 'Ingreso' : 'Gasto'}</span></td>
                                        <td className={`text-right ${tx.type}`}>{tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="imp-summary">
                        <span>{parsed.filter(t => t.selected).length} seleccionadas</span>
                        <span>Ingresos: {fmt(parsed.filter(t => t.selected && t.type === 'income').reduce((s, t) => s + t.amount, 0))}</span>
                        <span>Gastos: {fmt(parsed.filter(t => t.selected && t.type === 'expense').reduce((s, t) => s + t.amount, 0))}</span>
                    </div>

                    <button type="button" className="btn btn-primary btn-lg" onClick={handleImport} disabled={importing || parsed.filter(t => t.selected).length === 0}>
                        {importing ? 'Importando...' : `Importar ${parsed.filter(t => t.selected).length} transacciones`}
                    </button>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="imp-result">
                    <CheckCircle size={48} color="#10B981" />
                    <h3>{result.count} transacciones importadas</h3>
                    <p>Las transacciones han sido agregadas a tu historial</p>
                    <button type="button" className="btn btn-primary" onClick={() => { setResult(null); setFileName(''); }}>
                        <Upload size={16} /> Importar más
                    </button>
                </div>
            )}

            {/* Instructions */}
            <div className="imp-instructions">
                <h3>Bancos Compatibles</h3>
                <ul>
                    <li><strong>Bancolombia:</strong> Sucursal Virtual → Extractos → Descargar Excel</li>
                    <li><strong>Nequi:</strong> Historial → Exportar → Excel</li>
                    <li><strong>Banco de Bogotá:</strong> Consultas → Movimientos → Exportar Excel</li>
                    <li><strong>AV Villas:</strong> Cuentas → Movimientos → Descargar</li>
                    <li><strong>Davivienda:</strong> Consultas → Extracto → Descargar XLS</li>
                    <li><strong>BBVA:</strong> Posición Global → Movimientos → Exportar</li>
                </ul>
                <h3 style={{ marginTop: '1rem' }}>Detección Automática</h3>
                <ul>
                    <li>Detecta columnas: Fecha, Descripción/Concepto/Detalle, Monto/Valor, Débito/Crédito</li>
                    <li>Salta filas de encabezado y resumen automáticamente</li>
                    <li>Soporta formatos de fecha DD/MM/YYYY y YYYY-MM-DD</li>
                    <li>Soporta montos con puntos de miles y comas decimales (formato colombiano)</li>
                </ul>
            </div>
        </div>
    );
}
