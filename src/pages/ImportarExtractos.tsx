import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, FileSpreadsheet, TrendingUp, TrendingDown, Wand2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { applyRules, type CategorizationRule } from '../lib/categorizationRules';
import './ImportarExtractos.css';

interface ParsedTransaction {
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    selected: boolean;
    category_id?: string | null;
    merchant?: string | null;
    isDuplicate?: boolean;
}

// ─── AI Analysis Types ────────────────────────────────────────────────────────
interface StatementAnalysis {
    dateColumn: string;
    amountColumn: string;
    descriptionColumn: string;
    typeColumn: string | null;
    creditIndicator: string | null;
    debitIndicator: string | null;
    dateFormat: string;
    delimiter: string;
    skipRows: number;
    bankName: string | null;
}

// ─── Bank Preset Types ────────────────────────────────────────────────────────
interface ColumnHints {
    date: string[];
    desc: string[];
    debit: string[];
    credit: string[];
    amount: string[];
}

interface BankPreset {
    id: string;
    name: string;
    logo: string;
    delimiter: string;
    skipRows: number;
    dateFormat: string;
    columns: ColumnHints;
    hint: string;
    /** When true, a single amount column uses "+/- $value" Nequi-style sign */
    nequiStyle?: boolean;
}

const BANK_PRESETS: BankPreset[] = [
    {
        id: 'bancolombia',
        name: 'Bancolombia',
        logo: '🟡',
        delimiter: ';',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha'],
            desc: ['descripcion', 'descripción', 'referencia', 'oficina'],
            debit: ['debito', 'débito'],
            credit: ['credito', 'crédito'],
            amount: ['valor'],
        },
        hint: 'Sucursal Virtual → Extractos → Descargar CSV (separado por ;)',
    },
    {
        id: 'davivienda',
        name: 'Davivienda',
        logo: '🔴',
        delimiter: '|',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha'],
            desc: ['descripcion', 'descripción'],
            debit: ['valor_debito', 'debito', 'débito'],
            credit: ['valor_credito', 'credito', 'crédito'],
            amount: ['valor'],
        },
        hint: 'Consultas → Extracto → Descargar (separado por |)',
    },
    {
        id: 'bbva',
        name: 'BBVA Colombia',
        logo: '🔵',
        delimiter: ',',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha'],
            desc: ['concepto', 'descripcion', 'descripción'],
            debit: ['importe negativo', 'cargo'],
            credit: ['importe positivo', 'abono'],
            amount: ['importe', 'monto', 'valor'],
        },
        hint: 'Posición Global → Movimientos → Exportar CSV',
    },
    {
        id: 'nequi',
        name: 'Nequi',
        logo: '💜',
        delimiter: ',',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha'],
            desc: ['descripcion', 'descripción', 'concepto', 'detalle'],
            debit: [],
            credit: [],
            amount: ['valor', 'monto', 'amount'],
        },
        hint: 'Historial → Exportar → Excel/CSV  (+$100,000 = ingreso, -$50,000 = gasto)',
        nequiStyle: true,
    },
    {
        id: 'bogota',
        name: 'Banco de Bogotá',
        logo: '🟢',
        delimiter: ';',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha'],
            desc: ['descripcion', 'descripción', 'detalle', 'concepto'],
            debit: ['debito', 'débito', 'cargo', 'retiro'],
            credit: ['credito', 'crédito', 'abono', 'deposito'],
            amount: ['valor', 'monto'],
        },
        hint: 'Consultas → Movimientos → Exportar Excel/CSV',
    },
    {
        id: 'scotiabank',
        name: 'Scotiabank Colpatria',
        logo: '🔴',
        delimiter: ';',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha', 'date'],
            desc: ['descripcion', 'descripción', 'concepto', 'detalle'],
            debit: ['debito', 'débito', 'cargo', 'retiro'],
            credit: ['credito', 'crédito', 'abono', 'deposito'],
            amount: ['valor', 'monto', 'importe'],
        },
        hint: 'Sucursal Virtual → Movimientos → Exportar (separado por ;)',
    },
    {
        id: 'popular',
        name: 'Banco Popular',
        logo: '🟠',
        delimiter: ',',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha', 'fecha transaccion', 'fecha transacción'],
            desc: ['descripcion', 'descripción', 'concepto', 'oficina', 'detalle'],
            debit: ['debito', 'débito', 'cargo', 'retiro', 'egreso'],
            credit: ['credito', 'crédito', 'abono', 'deposito', 'ingreso'],
            amount: ['valor', 'monto'],
        },
        hint: 'Consultas en línea → Extracto → Descargar CSV',
    },
    {
        id: 'nubank',
        name: 'Nu Colombia',
        logo: '💜',
        delimiter: ',',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha', 'date', 'fecha transaccion', 'fecha transacción'],
            desc: ['descripcion', 'descripción', 'concepto', 'comercio', 'detalle'],
            debit: [],
            credit: [],
            amount: ['valor', 'monto', 'amount', 'importe'],
        },
        hint: 'Nu app → Extracto → Exportar CSV (+valor = ingreso, -valor = gasto)',
        nequiStyle: true,
    },
    {
        id: 'rappipay',
        name: 'RappiPay',
        logo: '🟡',
        delimiter: ',',
        skipRows: 0,
        dateFormat: 'DD/MM/YYYY',
        columns: {
            date: ['fecha', 'date', 'fecha movimiento'],
            desc: ['descripcion', 'descripción', 'concepto', 'comercio', 'establecimiento'],
            debit: [],
            credit: [],
            amount: ['valor', 'monto', 'amount'],
        },
        hint: 'RappiPay → Historial → Descargar CSV (+valor = recarga, -valor = gasto)',
        nequiStyle: true,
    },
    {
        id: 'generic',
        name: 'Otro / Genérico',
        logo: '📄',
        delimiter: 'auto',
        skipRows: 0,
        dateFormat: 'auto',
        columns: {
            date: ['fecha', 'date', 'f.', 'dia'],
            desc: ['desc', 'concepto', 'detalle', 'referencia', 'nombre', 'observ', 'movimiento'],
            debit: ['debito', 'cargo', 'retiro', 'salida', 'egreso'],
            credit: ['credito', 'abono', 'deposito', 'entrada', 'ingreso'],
            amount: ['monto', 'valor', 'amount', 'importe', 'total'],
        },
        hint: 'Detección automática de separador y columnas',
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

/** Parse a Nequi-style amount string like "+ $100.000" or "- $50.000" */
function parseNequiAmount(raw: unknown): { amount: number; type: 'income' | 'expense' } | null {
    if (!raw) return null;
    const s = String(raw).trim();
    const isNeg = s.startsWith('-') || s.includes('(');
    const amount = parseAmount(s);
    if (amount === 0) return null;
    return { amount, type: isNeg ? 'expense' : 'income' };
}

// ─── AI Analysis → BankPreset converter ──────────────────────────────────────
function analysisToPreset(analysis: StatementAnalysis): BankPreset {
    const delimMap: Record<string, string> = {
        'punto y coma': ';',
        'coma': ',',
        'tab': '\t',
        'tabulador': '\t',
        'barra vertical': '|',
    };
    const rawDelim = analysis.delimiter?.toLowerCase() ?? '';
    const delimiter = delimMap[rawDelim] ?? (rawDelim.length === 1 ? rawDelim : 'auto');

    const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

    const dateNorm = normalize(analysis.dateColumn ?? '');
    const amountNorm = normalize(analysis.amountColumn ?? '');
    const descNorm = normalize(analysis.descriptionColumn ?? '');
    const creditNorm = analysis.creditIndicator ? normalize(analysis.creditIndicator) : '';
    const debitNorm = analysis.debitIndicator ? normalize(analysis.debitIndicator) : '';

    return {
        id: 'ai-detected',
        name: analysis.bankName ?? 'Detectado por IA',
        logo: '✨',
        delimiter,
        skipRows: analysis.skipRows ?? 0,
        dateFormat: analysis.dateFormat ?? 'DD/MM/YYYY',
        columns: {
            date: dateNorm ? [dateNorm] : ['fecha', 'date'],
            desc: descNorm ? [descNorm] : ['descripcion', 'concepto'],
            debit: debitNorm ? [debitNorm] : ['debito', 'cargo'],
            credit: creditNorm ? [creditNorm] : ['credito', 'abono'],
            amount: amountNorm ? [amountNorm] : ['valor', 'monto'],
        },
        hint: 'Configuración detectada automáticamente por IA',
    };
}

// ─── Core Parser ─────────────────────────────────────────────────────────────
function parseRows(
    headers: string[],
    rows: unknown[][],
    preset?: BankPreset,
): ParsedTransaction[] {
    const h = headers.map(x =>
        x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
    );

    // Use preset column hints if provided, otherwise fall back to defaults
    const colHints = preset?.columns ?? {
        date: ['fecha', 'date', 'f.', 'dia'],
        desc: ['desc', 'concepto', 'detalle', 'referencia', 'nombre', 'observ', 'movimiento'],
        debit: ['debito', 'cargo', 'retiro', 'salida', 'egreso'],
        credit: ['credito', 'abono', 'deposito', 'entrada', 'ingreso'],
        amount: ['monto', 'valor', 'amount', 'importe', 'total'],
    };

    const dateIdx = findColumnIndex(h, colHints.date);
    const descIdx = findColumnIndex(h, colHints.desc);
    const amountIdx = findColumnIndex(h, colHints.amount);
    const debitIdx = findColumnIndex(h, colHints.debit);
    const creditIdx = findColumnIndex(h, colHints.credit);

    const nequiStyle = preset?.nequiStyle ?? false;

    const results: ParsedTransaction[] = [];

    for (const row of rows) {
        let amount = 0;
        let type: 'income' | 'expense' = 'expense';

        if (nequiStyle && amountIdx >= 0) {
            // Nequi: "+/- $value" in single column
            const parsed = parseNequiAmount(row[amountIdx]);
            if (!parsed) continue;
            amount = parsed.amount;
            type = parsed.type;
        } else if (debitIdx >= 0 && creditIdx >= 0) {
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
            const rawStr = String(rawVal || '');
            type = rawStr.startsWith('-') || rawStr.includes('(') ? 'expense' : 'income';
        } else {
            // Fallback: find any numeric column
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

function parseCSV(text: string, preset?: BankPreset): ParsedTransaction[] {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Determine separator: use preset or auto-detect
    let sep: string;
    if (preset && preset.delimiter !== 'auto') {
        sep = preset.delimiter;
    } else {
        sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : lines[0].includes('|') ? '|' : ',';
    }

    const skipRows = preset?.skipRows ?? 0;
    const startIdx = skipRows;
    const headers = lines[startIdx].split(sep).map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(startIdx + 1).map(l => l.split(sep).map(c => c.trim().replace(/"/g, '')));
    return parseRows(headers, rows, preset);
}

function parseXLSX(buffer: ArrayBuffer, preset?: BankPreset): ParsedTransaction[] {
    const workbook = XLSX.read(buffer, { type: 'array' });

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const data: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (data.length < 2) continue;

        // Respect preset skipRows or auto-detect header row
        let headerRowIdx = preset?.skipRows ?? 0;
        if (!preset || preset.id === 'generic') {
            for (let i = 0; i < Math.min(data.length, 15); i++) {
                const row = data[i] as string[];
                const textCells = row.filter(c => c && typeof c === 'string' && c.length > 1).length;
                if (textCells >= 3) { headerRowIdx = i; break; }
            }
        }

        const headers = (data[headerRowIdx] as string[]).map(c => String(c || ''));
        const rows = data.slice(headerRowIdx + 1).filter(r =>
            (r as unknown[]).some(c => c !== null && c !== undefined && c !== ''),
        );

        const results = parseRows(headers, rows as unknown[][], preset);
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
        const getVal = (tag: string) => {
            const m = block.match(new RegExp(`<${tag}>(.*?)(?:<|$)`, 'i'));
            return m ? m[1].trim() : '';
        };
        const amount = parseFloat(getVal('TRNAMT') || '0');
        if (amount === 0) continue;
        const rawDate = getVal('DTPOSTED');
        const date = rawDate.length >= 8
            ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
            : format(new Date(), 'yyyy-MM-dd');
        results.push({
            date,
            description: getVal('NAME') || getVal('MEMO') || '',
            amount: Math.abs(amount),
            type: amount > 0 ? 'income' : 'expense',
            selected: true,
        });
    }
    return results;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ImportarExtractos() {
    const { user, profile } = useAuth();
    const [selectedPreset, setSelectedPreset] = useState<BankPreset>(BANK_PRESETS[BANK_PRESETS.length - 1]); // default: generic
    const [parsed, setParsed] = useState<ParsedTransaction[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ count: number } | null>(null);
    const [error, setError] = useState('');
    const [fileName, setFileName] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const currency = profile?.currency || 'COP';
    const [categRules, setCategRules] = useState<CategorizationRule[]>([]);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiDetected, setAiDetected] = useState<string | null>(null);

    // Load categorization rules on mount
    useEffect(() => {
        if (!user) return;
        supabase
            .from('categorization_rules')
            .select('*')
            .eq('user_id', user.id)
            .then(({ data }) => {
                if (data) setCategRules(data as CategorizationRule[]);
            });
    }, [user]);

    const handleFile = useCallback(async (file: File, preset: BankPreset) => {
        setError('');
        setResult(null);
        setFileName(file.name);

        let txs: ParsedTransaction[] = [];
        const ext = file.name.toLowerCase().split('.').pop() || '';

        try {
            if (ext === 'xlsx' || ext === 'xls') {
                const buffer = await file.arrayBuffer();
                txs = parseXLSX(buffer, preset);
            } else if (ext === 'ofx' || ext === 'qfx') {
                const text = await file.text();
                txs = parseOFX(text);
            } else {
                const text = await file.text();
                txs = parseCSV(text, preset);
            }
        } catch (e) {
            setError(`Error al leer el archivo: ${e}`);
            return;
        }

        if (txs.length === 0) {
            setError('No se encontraron transacciones. Verifica que el archivo tenga columnas como Fecha, Concepto/Descripción, Monto/Valor o Débito/Crédito.');
            return;
        }
        // Apply categorization rules
        const withCategories = categRules.length > 0
            ? (applyRules(txs, categRules) as ParsedTransaction[])
            : txs;

        // Duplicate detection: check against existing transactions
        if (user && withCategories.length > 0) {
            const dates = withCategories.map(t => t.date);
            const minDate = dates.reduce((a, b) => a < b ? a : b);
            const maxDate = dates.reduce((a, b) => a > b ? a : b);
            const { data: existing } = await supabase
                .from('transactions')
                .select('date, amount')
                .eq('user_id', user.id)
                .gte('date', minDate)
                .lte('date', maxDate);

            if (existing && existing.length > 0) {
                const existingSet = new Set(existing.map(e => `${e.date}_${Number(e.amount)}`));
                const flagged = withCategories.map(t => ({
                    ...t,
                    isDuplicate: existingSet.has(`${t.date}_${t.amount}`),
                    selected: !existingSet.has(`${t.date}_${t.amount}`),
                }));
                setParsed(flagged);
                return;
            }
        }

        setParsed(withCategories);
    }, [user, categRules]);

    const handleAnalyzeWithAI = useCallback(async (file: File) => {
        const ext = file.name.toLowerCase().split('.').pop() ?? '';
        if (ext !== 'csv') {
            setError('El análisis con IA solo está disponible para archivos CSV.');
            return;
        }
        if (file.size > 51200) {
            setError('El archivo es demasiado grande para el análisis con IA (máximo 50KB).');
            return;
        }
        setAiLoading(true);
        setError('');
        setAiDetected(null);
        try {
            const csvContent = await file.text();
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token ?? '';
            const res = await fetch('/api/parse-statement', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ csvContent }),
            });
            if (!res.ok) {
                const errData = (await res.json()) as { error?: string };
                throw new Error(errData.error ?? `Error ${res.status}`);
            }
            const analysis = (await res.json()) as StatementAnalysis;
            const aiPreset = analysisToPreset(analysis);
            setSelectedPreset(aiPreset);
            setAiDetected(analysis.bankName ?? 'formato desconocido');
            await handleFile(file, aiPreset);
        } catch (e) {
            setError(`Error al analizar con IA: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setAiLoading(false);
        }
    }, [handleFile]);

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
                category_id: tx.category_id || null,
            });
            if (!error) count++;
        }
        setResult({ count });
        setImporting(false);
        setParsed([]);
    };

    const fmt = (n: number) =>
        new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(n);

    const selectedCount = parsed.filter(t => t.selected).length;
    const totalIncome = parsed.filter(t => t.selected && t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = parsed.filter(t => t.selected && t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const autoCategorizedCount = parsed.filter(t => t.category_id).length;
    const duplicateCount = parsed.filter(t => t.isDuplicate).length;

    const resetAll = () => {
        setParsed([]);
        setFileName('');
        setError('');
        setResult(null);
        setPendingFile(null);
        setAiDetected(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="importar-page animate-fadeIn">
            <div className="imp-header">
                <div>
                    <h1>Importar Extractos</h1>
                    <p>Importa transacciones desde extractos bancarios colombianos</p>
                </div>
            </div>

            {/* Supported Formats */}
            <div className="imp-formats">
                <div className="imp-format highlight">
                    <FileSpreadsheet size={20} />
                    <div>
                        <strong>Excel (XLSX / XLS)</strong>
                        <span>Bancolombia, Nequi, Banco de Bogotá, AV Villas, Davivienda, BBVA</span>
                    </div>
                </div>
                <div className="imp-format">
                    <FileText size={20} />
                    <div>
                        <strong>CSV</strong>
                        <span>Archivos separados por comas, punto y coma, barra vertical o tabulador</span>
                    </div>
                </div>
                <div className="imp-format">
                    <FileText size={20} />
                    <div>
                        <strong>OFX / QFX</strong>
                        <span>Open Financial Exchange (estándar internacional)</span>
                    </div>
                </div>
            </div>

            {/* Bank Selector — only visible before upload / after reset */}
            {parsed.length === 0 && !result && (
                <>
                    <div className="imp-bank-section">
                        <h2 className="imp-bank-title">Selecciona tu banco</h2>
                        <p className="imp-bank-subtitle">
                            Elige un banco para pre-configurar el formato automáticamente
                        </p>
                        <div className="imp-bank-grid">
                            {BANK_PRESETS.map(preset => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    className={`imp-bank-btn${selectedPreset.id === preset.id ? ' active' : ''}`}
                                    onClick={() => setSelectedPreset(preset)}
                                >
                                    <span className="imp-bank-logo">{preset.logo}</span>
                                    <span className="imp-bank-name">{preset.name}</span>
                                    {selectedPreset.id === preset.id && (
                                        <span className="imp-bank-check">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Preset detail hint */}
                        <div className="imp-preset-hint">
                            <span className="imp-preset-logo">{selectedPreset.logo}</span>
                            <div>
                                <strong>{selectedPreset.name}</strong>
                                <span>{selectedPreset.hint}</span>
                                {selectedPreset.id !== 'generic' && (
                                    <span className="imp-preset-meta">
                                        Separador:{' '}
                                        <code>{selectedPreset.delimiter === 'auto' ? 'automático' : selectedPreset.delimiter === '|' ? 'barra vertical (|)' : selectedPreset.delimiter === ';' ? 'punto y coma (;)' : 'coma (,)'}</code>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Upload Area */}
                    {!pendingFile ? (
                        <div
                            className="imp-upload"
                            onClick={() => fileRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                                e.preventDefault();
                                const f = e.dataTransfer.files?.[0];
                                if (f) setPendingFile(f);
                            }}
                        >
                            <Upload size={48} />
                            <h3>Arrastra o selecciona tu extracto de {selectedPreset.name}</h3>
                            <p>Formatos: .xlsx, .xls, .csv, .ofx, .qfx</p>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.xls,.csv,.ofx,.qfx"
                                className="imp-file-input"
                                aria-label="Seleccionar archivo de extracto bancario"
                                onChange={e => {
                                    if (e.target.files?.[0]) setPendingFile(e.target.files[0]);
                                }}
                            />
                        </div>
                    ) : (
                        <div className="imp-pending-file">
                            <div className="imp-pending-info">
                                <FileText size={20} />
                                <span className="imp-pending-name">{pendingFile.name}</span>
                                <button
                                    type="button"
                                    className="btn btn-ghost imp-pending-clear"
                                    onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                                    aria-label="Quitar archivo"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                            <div className="imp-pending-actions">
                                {pendingFile.name.toLowerCase().endsWith('.csv') && (
                                    <button
                                        type="button"
                                        className="btn btn-ai"
                                        onClick={() => handleAnalyzeWithAI(pendingFile)}
                                        disabled={aiLoading}
                                    >
                                        {aiLoading ? (
                                            <>
                                                <span className="imp-ai-spinner" />
                                                Analizando formato...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={16} />
                                                Analizar con IA
                                            </>
                                        )}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => handleFile(pendingFile, selectedPreset)}
                                    disabled={aiLoading}
                                >
                                    <Upload size={16} />
                                    Importar con preset
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {aiDetected && parsed.length > 0 && (
                <div className="imp-ai-detected">
                    <Sparkles size={15} />
                    Formato detectado: <strong>{aiDetected}</strong>
                </div>
            )}

            {error && (
                <div className="imp-error">
                    <AlertTriangle size={16} /> {error}
                </div>
            )}

            {/* Preview */}
            {parsed.length > 0 && (
                <div className="imp-preview">
                    <div className="imp-preview-header">
                        <div className="imp-preview-title">
                            <h3>{fileName}</h3>
                            <div className="imp-found-badge">
                                {parsed.length} transacciones encontradas
                            </div>
                            {autoCategorizedCount > 0 && (
                                <div className="imp-autocat-badge">
                                    <Wand2 size={13} />
                                    {autoCategorizedCount} auto-categorizadas por reglas
                                </div>
                            )}
                        </div>
                        <div className="imp-preview-actions">
                            <button type="button" className="btn btn-ghost" onClick={toggleAll}>
                                Seleccionar/Deseleccionar
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={resetAll}>
                                <X size={16} /> Cancelar
                            </button>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="imp-summary-cards">
                        <div className="imp-summary-card selected">
                            <span className="imp-sc-label">Seleccionadas</span>
                            <span className="imp-sc-value">{selectedCount}</span>
                        </div>
                        <div className="imp-summary-card income">
                            <TrendingUp size={16} />
                            <span className="imp-sc-label">Total Ingresos</span>
                            <span className="imp-sc-value income">{fmt(totalIncome)}</span>
                        </div>
                        <div className="imp-summary-card expense">
                            <TrendingDown size={16} />
                            <span className="imp-sc-label">Total Gastos</span>
                            <span className="imp-sc-value expense">{fmt(totalExpense)}</span>
                        </div>
                        {duplicateCount > 0 && (
                            <div className="imp-summary-card duplicate">
                                <AlertTriangle size={16} />
                                <span className="imp-sc-label">Posibles duplicados</span>
                                <span className="imp-sc-value duplicate">{duplicateCount}</span>
                            </div>
                        )}
                    </div>

                    <div className="imp-table-wrap">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th className="imp-th-check" scope="col">Sel.</th>
                                    <th>Fecha</th>
                                    <th>Descripción</th>
                                    <th>Tipo</th>
                                    <th className="text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsed.map((tx, i) => (
                                    <tr
                                        key={i}
                                        className={[
                                            tx.selected ? '' : 'deselected',
                                            `row-${tx.type}`,
                                            tx.isDuplicate ? 'row-duplicate' : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <td>
                                            <input
                                                type="checkbox"
                                                title="Seleccionar transacción"
                                                checked={tx.selected}
                                                onChange={() => toggleSelect(i)}
                                            />
                                        </td>
                                        <td>{tx.date}</td>
                                        <td>
                                            {tx.description || '—'}
                                            {tx.isDuplicate && (
                                                <span className="dup-badge" title="Posible duplicado: ya existe una transacción con la misma fecha y monto">
                                                    dup
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`type-badge ${tx.type}`}>
                                                {tx.type === 'income' ? 'Ingreso' : 'Gasto'}
                                            </span>
                                        </td>
                                        <td className={`text-right amount-${tx.type}`}>
                                            {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary btn-lg"
                        onClick={handleImport}
                        disabled={importing || selectedCount === 0}
                    >
                        {importing
                            ? 'Importando...'
                            : `Importar ${selectedCount} transaccione${selectedCount !== 1 ? 's' : ''}`}
                    </button>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="imp-result">
                    <CheckCircle size={48} color="#10B981" />
                    <h3>{result.count} transacciones importadas</h3>
                    <p>Las transacciones han sido agregadas a tu historial</p>
                    <button type="button" className="btn btn-primary" onClick={resetAll}>
                        <Upload size={16} /> Importar más
                    </button>
                </div>
            )}

            {/* Instructions */}
            <div className="imp-instructions">
                <h3>Bancos Compatibles</h3>
                <ul>
                    <li><strong>Bancolombia:</strong> Sucursal Virtual → Extractos → Descargar Excel/CSV</li>
                    <li><strong>Nequi:</strong> Historial → Exportar → Excel</li>
                    <li><strong>Banco de Bogotá:</strong> Consultas → Movimientos → Exportar Excel</li>
                    <li><strong>AV Villas:</strong> Cuentas → Movimientos → Descargar</li>
                    <li><strong>Davivienda:</strong> Consultas → Extracto → Descargar XLS</li>
                    <li><strong>BBVA:</strong> Posición Global → Movimientos → Exportar</li>
                </ul>
                <h3 className="imp-instructions-h3-mt">Detección Automática</h3>
                <ul>
                    <li>Detecta columnas: Fecha, Descripción/Concepto/Detalle, Monto/Valor, Débito/Crédito</li>
                    <li>Soporta separadores: coma (,), punto y coma (;), barra vertical (|) y tabulador</li>
                    <li>Salta filas de encabezado y resumen automáticamente</li>
                    <li>Soporta formatos de fecha DD/MM/YYYY y YYYY-MM-DD</li>
                    <li>Soporta montos con puntos de miles y comas decimales (formato colombiano)</li>
                    <li>Soporta montos Nequi con signo: +$100.000 / -$50.000</li>
                </ul>
            </div>
        </div>
    );
}
