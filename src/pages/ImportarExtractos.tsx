import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import './ImportarExtractos.css';

interface ParsedTransaction {
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    selected: boolean;
}

function parseCSV(text: string): ParsedTransaction[] {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].toLowerCase().split(/[,;\t]/).map(h => h.trim().replace(/"/g, ''));
    const dateIdx = headers.findIndex(h => h.includes('fecha') || h === 'date' || h.includes('f.'));
    const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('concepto') || h.includes('referencia') || h.includes('detalle'));
    const amountIdx = headers.findIndex(h => h.includes('monto') || h.includes('valor') || h.includes('amount') || h.includes('importe'));
    const debitIdx = headers.findIndex(h => h.includes('débito') || h.includes('debito') || h.includes('cargo'));
    const creditIdx = headers.findIndex(h => h.includes('crédito') || h.includes('credito') || h.includes('abono'));

    const results: ParsedTransaction[] = [];
    const separator = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(separator).map(c => c.trim().replace(/"/g, ''));
        let amount = 0;
        let type: 'income' | 'expense' = 'expense';

        if (debitIdx >= 0 && creditIdx >= 0) {
            const debit = parseFloat(cols[debitIdx]?.replace(/[^0-9.-]/g, '') || '0');
            const credit = parseFloat(cols[creditIdx]?.replace(/[^0-9.-]/g, '') || '0');
            if (credit > 0) { amount = credit; type = 'income'; }
            else if (debit > 0) { amount = debit; type = 'expense'; }
            else continue;
        } else if (amountIdx >= 0) {
            const raw = parseFloat(cols[amountIdx]?.replace(/[^0-9.-]/g, '') || '0');
            if (raw === 0) continue;
            amount = Math.abs(raw);
            type = raw > 0 ? 'income' : 'expense';
        } else continue;

        let date = format(new Date(), 'yyyy-MM-dd');
        if (dateIdx >= 0 && cols[dateIdx]) {
            const d = cols[dateIdx];
            // Try common date formats
            const parts = d.split(/[/\-.]/);
            if (parts.length === 3) {
                if (parts[0].length === 4) date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                else if (parts[2].length === 4) date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                else date = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        const description = descIdx >= 0 ? cols[descIdx] || '' : '';
        results.push({ date, description, amount, type, selected: true });
    }
    return results;
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
        const text = await file.text();

        let txs: ParsedTransaction[] = [];
        if (file.name.endsWith('.ofx') || file.name.endsWith('.qfx')) {
            txs = parseOFX(text);
        } else {
            txs = parseCSV(text);
        }

        if (txs.length === 0) {
            setError('No se encontraron transacciones en el archivo. Verifica el formato.');
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
                description: tx.description || null, date: tx.date,
                payment_method: 'other',
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
                <div><h1>Importar Extractos</h1><p>Importa transacciones desde extractos bancarios</p></div>
            </div>

            {/* Supported Formats */}
            <div className="imp-formats">
                <div className="imp-format"><FileText size={20} /><div><strong>CSV</strong><span>Archivos separados por comas, punto y coma o tabulador</span></div></div>
                <div className="imp-format"><FileText size={20} /><div><strong>OFX / QFX</strong><span>Open Financial Exchange (estándar bancario)</span></div></div>
            </div>

            {/* Upload Area */}
            {parsed.length === 0 && !result && (
                <div className="imp-upload" onClick={() => fileRef.current?.click()}>
                    <Upload size={48} />
                    <h3>Arrastra o selecciona un archivo</h3>
                    <p>Formatos: .csv, .ofx, .qfx</p>
                    <input ref={fileRef} type="file" accept=".csv,.ofx,.qfx" style={{ display: 'none' }}
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
                            <button type="button" className="btn btn-ghost" onClick={toggleAll}>Seleccionar/Deseleccionar todas</button>
                            <button type="button" className="btn btn-ghost" onClick={() => { setParsed([]); setFileName(''); }}>
                                <X size={16} /> Cancelar
                            </button>
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
                <h3>Instrucciones</h3>
                <ul>
                    <li><strong>CSV:</strong> El archivo debe tener columnas como Fecha, Descripción/Concepto, Monto/Valor. Detecta automáticamente separadores (coma, punto y coma, tabulador).</li>
                    <li><strong>OFX/QFX:</strong> Descarga el extracto desde tu banco en formato OFX. Compatible con Bancolombia, Davivienda, BBVA y la mayoría de bancos.</li>
                    <li><strong>Débito/Crédito:</strong> Si tu CSV tiene columnas separadas de Débito y Crédito, se detectan automáticamente.</li>
                    <li>Revisa las transacciones antes de importar y deselecciona las que no quieras incluir.</li>
                </ul>
            </div>
        </div>
    );
}
