import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Download, Upload, Database, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import './BackupRestore.css';

// Tables to include in the JSON backup, in dependency order
const PARENT_TABLES = [
    'accounts',
    'categories',
    'goals',
    'budgets',
    'debts',
    'warranties',
    'pets',
    'shopping_lists',
    'subscriptions',
    'investments',
    'personal_loans',
] as const;

const CHILD_TABLES = [
    { table: 'transactions',   userIdField: 'user_id' },
    { table: 'debt_payments',  userIdField: 'user_id' },
    { table: 'pet_events',     userIdField: 'user_id' },
    { table: 'shopping_items', userIdField: 'user_id' },
    { table: 'financial_notes', userIdField: 'user_id' },
] as const;

const TABLE_LABELS: Record<string, string> = {
    accounts:        'Cuentas',
    categories:      'Categorías',
    goals:           'Metas',
    budgets:         'Presupuestos',
    debts:           'Deudas',
    warranties:      'Garantías',
    pets:            'Mascotas',
    shopping_lists:  'Listas de compras',
    subscriptions:   'Suscripciones',
    investments:     'Inversiones',
    personal_loans:  'Préstamos personales',
    transactions:    'Transacciones',
    debt_payments:   'Pagos de deudas',
    pet_events:      'Eventos de mascotas',
    shopping_items:  'Items de compras',
    financial_notes: 'Notas financieras',
};

type BackupData = Record<string, unknown[]>;

interface BackupFile {
    version: string;
    exported_at: string;
    user_email: string;
    data: BackupData;
}

interface ProgressStep {
    table: string;
    status: 'pending' | 'loading' | 'done' | 'error';
    count?: number;
    error?: string;
}

function formatDate(iso: string): string {
    return iso.slice(0, 10);
}

export function BackupRestore() {
    const { user } = useAuth();

    // Export state
    const [exporting, setExporting] = useState(false);
    const [exportSteps, setExportSteps] = useState<ProgressStep[]>([]);
    const [exportDone, setExportDone] = useState(false);

    // Import state
    const [importFile, setImportFile] = useState<File | null>(null);
    const [parsedBackup, setParsedBackup] = useState<BackupFile | null>(null);
    const [parseError, setParseError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importSteps, setImportSteps] = useState<ProgressStep[]>([]);
    const [importDone, setImportDone] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // ─── EXPORT ────────────────────────────────────────────────────────────────

    const handleExport = async () => {
        if (!user) return;
        setExporting(true);
        setExportDone(false);

        const allTables = [
            ...PARENT_TABLES.map(t => t as string),
            ...CHILD_TABLES.map(c => c.table as string),
        ];

        const initialSteps: ProgressStep[] = allTables.map(t => ({
            table: t,
            status: 'pending',
        }));
        setExportSteps(initialSteps);

        const data: BackupData = {};

        for (let i = 0; i < allTables.length; i++) {
            const tableName = allTables[i];

            setExportSteps(prev =>
                prev.map((s, idx) =>
                    idx === i ? { ...s, status: 'loading' } : s
                )
            );

            try {
                const { data: rows, error } = await (supabase as any)
                    .from(tableName)
                    .select('*')
                    .eq('user_id', user.id);

                if (error) {
                    // Table may not exist or no user_id field — skip gracefully
                    data[tableName] = [];
                    setExportSteps(prev =>
                        prev.map((s, idx) =>
                            idx === i ? { ...s, status: 'done', count: 0 } : s
                        )
                    );
                } else {
                    const safeRows = rows ?? [];
                    data[tableName] = safeRows;
                    setExportSteps(prev =>
                        prev.map((s, idx) =>
                            idx === i ? { ...s, status: 'done', count: safeRows.length } : s
                        )
                    );
                }
            } catch {
                data[tableName] = [];
                setExportSteps(prev =>
                    prev.map((s, idx) =>
                        idx === i ? { ...s, status: 'error', count: 0 } : s
                    )
                );
            }
        }

        const backup: BackupFile = {
            version: '1.0',
            exported_at: new Date().toISOString(),
            user_email: user.email ?? '',
            data,
        };

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bc-money-backup-${formatDate(backup.exported_at)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        setExporting(false);
        setExportDone(true);
    };

    // ─── FILE SELECTION & PARSE ────────────────────────────────────────────────

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setImportFile(file);
        setParsedBackup(null);
        setParseError(null);
        setShowConfirm(false);
        setImportDone(false);
        setImportSteps([]);

        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result as string;
                const parsed = JSON.parse(text) as BackupFile;
                if (!parsed.version || !parsed.data) {
                    throw new Error('El archivo no tiene el formato correcto de BC Money.');
                }
                setParsedBackup(parsed);
            } catch (err) {
                setParseError(
                    err instanceof Error ? err.message : 'No se pudo leer el archivo JSON.'
                );
            }
        };
        reader.readAsText(file);
    };

    // ─── IMPORT ────────────────────────────────────────────────────────────────

    const handleImport = async () => {
        if (!user || !parsedBackup) return;
        setImporting(true);
        setShowConfirm(false);
        setImportDone(false);

        const allTables = [
            ...PARENT_TABLES.map(t => t as string),
            ...CHILD_TABLES.map(c => c.table as string),
        ];

        const initial: ProgressStep[] = allTables.map(t => ({
            table: t,
            status: 'pending',
        }));
        setImportSteps(initial);

        for (let i = 0; i < allTables.length; i++) {
            const tableName = allTables[i];
            const rows = parsedBackup.data[tableName];

            setImportSteps(prev =>
                prev.map((s, idx) =>
                    idx === i ? { ...s, status: 'loading' } : s
                )
            );

            if (!rows || rows.length === 0) {
                setImportSteps(prev =>
                    prev.map((s, idx) =>
                        idx === i ? { ...s, status: 'done', count: 0 } : s
                    )
                );
                continue;
            }

            // Replace user_id so backup from another user works correctly
            const mapped = rows.map((r: any) => ({ ...r, user_id: user.id }));

            let imported = 0;
            let hasError = false;

            // Upsert in batches of 100, ignoreDuplicates so existing records are untouched
            for (let j = 0; j < mapped.length; j += 100) {
                const batch = mapped.slice(j, j + 100);
                const { error } = await (supabase as any)
                    .from(tableName)
                    .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

                if (error) {
                    hasError = true;
                    setImportSteps(prev =>
                        prev.map((s, idx) =>
                            idx === i
                                ? { ...s, status: 'error', error: error.message }
                                : s
                        )
                    );
                    break;
                }
                imported += batch.length;
            }

            if (!hasError) {
                setImportSteps(prev =>
                    prev.map((s, idx) =>
                        idx === i ? { ...s, status: 'done', count: imported } : s
                    )
                );
            }
        }

        setImporting(false);
        setImportDone(true);
    };

    // ─── SUMMARY helpers ───────────────────────────────────────────────────────

    const summaryEntries = (data: BackupData) =>
        Object.entries(data).filter(([, rows]) => rows && rows.length > 0);

    // ─── RENDER ────────────────────────────────────────────────────────────────

    return (
        <div className="br-wrapper">
            <div className="br-header">
                <Database size={22} className="br-header-icon" />
                <div>
                    <h4 className="br-title">Backup & Restore — JSON</h4>
                    <p className="br-subtitle">
                        Exporta o importa todos tus datos en formato JSON estándar
                    </p>
                </div>
            </div>

            {/* ── EXPORT SECTION ── */}
            <div className="br-card">
                <div className="br-card-header">
                    <Download size={20} className="br-icon-green" />
                    <div>
                        <strong>Exportar backup completo</strong>
                        <p className="br-card-desc">
                            Descarga un archivo JSON con todas tus transacciones, cuentas, metas, deudas y más
                        </p>
                    </div>
                </div>

                <button
                    className="btn btn-primary br-btn"
                    onClick={handleExport}
                    disabled={exporting}
                >
                    {exporting ? (
                        <><Loader size={16} className="br-spin" /> Exportando...</>
                    ) : (
                        <><Download size={16} /> Descargar backup JSON</>
                    )}
                </button>

                {(exporting || exportDone) && exportSteps.length > 0 && (
                    <div className="br-progress">
                        {exportSteps.map(step => (
                            <div key={step.table} className="br-progress-row">
                                <span className="br-progress-label">
                                    {TABLE_LABELS[step.table] ?? step.table}
                                </span>
                                <span className={`br-progress-status br-status-${step.status}`}>
                                    {step.status === 'loading' && <Loader size={13} className="br-spin" />}
                                    {step.status === 'done' && <CheckCircle size={13} />}
                                    {step.status === 'error' && <AlertTriangle size={13} />}
                                    {step.status === 'pending' && <span className="br-dot" />}
                                    {step.status === 'done' && ` ${step.count ?? 0} registros`}
                                    {step.status === 'loading' && ' Exportando...'}
                                    {step.status === 'error' && ' Omitido'}
                                    {step.status === 'pending' && ' Esperando...'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {exportDone && (
                    <div className="br-toast br-toast-success">
                        <CheckCircle size={16} />
                        Backup descargado correctamente
                    </div>
                )}
            </div>

            {/* ── IMPORT SECTION ── */}
            <div className="br-card">
                <div className="br-card-header">
                    <Upload size={20} className="br-icon-blue" />
                    <div>
                        <strong>Importar backup</strong>
                        <p className="br-card-desc">
                            Restaura datos desde un archivo JSON generado por BC Money
                        </p>
                    </div>
                </div>

                <div className="br-warning">
                    <AlertTriangle size={15} className="br-warning-icon" />
                    <span>
                        <strong>Nota importante:</strong> Esta operación <em>no elimina</em> tus datos
                        actuales. Solo agrega registros que no existan. Los IDs duplicados se ignoran.
                    </span>
                </div>

                <label className="br-file-label">
                    <Upload size={15} />
                    {importFile ? importFile.name : 'Seleccionar archivo JSON'}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="br-file-input"
                        onChange={handleFileChange}
                        disabled={importing}
                    />
                </label>

                {parseError && (
                    <div className="br-toast br-toast-error">
                        <AlertTriangle size={15} />
                        {parseError}
                    </div>
                )}

                {parsedBackup && !parseError && (
                    <div className="br-summary">
                        <p className="br-summary-title">
                            Archivo válido — exportado el{' '}
                            <strong>{formatDate(parsedBackup.exported_at)}</strong>
                            {parsedBackup.user_email && (
                                <> por <strong>{parsedBackup.user_email}</strong></>
                            )}
                        </p>
                        <div className="br-summary-tags">
                            {summaryEntries(parsedBackup.data).map(([table, rows]) => (
                                <span key={table} className="br-tag">
                                    {TABLE_LABELS[table] ?? table}: {rows.length}
                                </span>
                            ))}
                            {summaryEntries(parsedBackup.data).length === 0 && (
                                <span className="br-tag-empty">El archivo no contiene datos</span>
                            )}
                        </div>

                        {!showConfirm && !importDone && (
                            <button
                                className="btn btn-primary br-btn"
                                onClick={() => setShowConfirm(true)}
                                disabled={importing}
                            >
                                <Upload size={16} /> Importar datos
                            </button>
                        )}

                        {showConfirm && (
                            <div className="br-confirm">
                                <p>
                                    ¿Confirmas la importación? Los registros con IDs existentes
                                    serán ignorados. No se borrará ningún dato actual.
                                </p>
                                <div className="br-confirm-actions">
                                    <button
                                        className="btn btn-primary br-btn"
                                        onClick={handleImport}
                                    >
                                        Sí, importar
                                    </button>
                                    <button
                                        className="btn br-btn-cancel"
                                        onClick={() => setShowConfirm(false)}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {(importing || importDone) && importSteps.length > 0 && (
                    <div className="br-progress">
                        {importSteps.map(step => (
                            <div key={step.table} className="br-progress-row">
                                <span className="br-progress-label">
                                    {TABLE_LABELS[step.table] ?? step.table}
                                </span>
                                <span className={`br-progress-status br-status-${step.status}`}>
                                    {step.status === 'loading' && <Loader size={13} className="br-spin" />}
                                    {step.status === 'done' && <CheckCircle size={13} />}
                                    {step.status === 'error' && <AlertTriangle size={13} />}
                                    {step.status === 'pending' && <span className="br-dot" />}
                                    {step.status === 'done' && ` ${step.count ?? 0} importados`}
                                    {step.status === 'loading' && ' Importando...'}
                                    {step.status === 'error' && ` Error: ${step.error ?? ''}`}
                                    {step.status === 'pending' && ' En espera...'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {importDone && (
                    <div className="br-toast br-toast-success">
                        <CheckCircle size={16} />
                        Importación completada. Revisa el detalle arriba.
                    </div>
                )}
            </div>
        </div>
    );
}
