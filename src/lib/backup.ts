import { supabase } from './supabase';

// .mafe format: encrypted JSON with AES-GCM using a derived key from user password
// Structure: [4-byte magic "MAFE"] [12-byte IV] [encrypted payload]

const MAGIC = new Uint8Array([0x4D, 0x41, 0x46, 0x45]); // "MAFE"
const BACKUP_VERSION = 1;

const TABLES = [
    'transactions', 'categories', 'budgets', 'goals', 'accounts',
    'debts', 'debt_payments', 'warranties', 'pets', 'pet_events',
    'shopping_lists', 'shopping_items', 'home_items', 'home_maintenance',
] as const;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function createBackup(userId: string, password: string): Promise<{ blob: Blob; filename: string; tables: Record<string, number> }> {
    // Fetch all user data
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    for (const table of TABLES) {
        const { data: rows, error } = await supabase
            .from(table)
            .select('*')
            .eq('user_id', userId);

        if (error) {
            // Some tables use different FK - try without user_id filter for child tables
            if (['debt_payments', 'pet_events', 'shopping_items', 'home_maintenance'].includes(table)) {
                // These are fetched via parent tables, skip direct fetch
                continue;
            }
            console.warn(`Skipping ${table}:`, error.message);
            continue;
        }
        data[table] = rows || [];
        counts[table] = (rows || []).length;
    }

    // Fetch child tables via their parent relationship
    const childTables: [string, string, string][] = [
        ['debt_payments', 'debt_id', 'debts'],
        ['pet_events', 'pet_id', 'pets'],
        ['shopping_items', 'list_id', 'shopping_lists'],
        ['home_maintenance', 'item_id', 'home_items'],
    ];

    for (const [child, fk, parent] of childTables) {
        const parentIds = (data[parent] || []).map((r: any) => r.id);
        if (parentIds.length === 0) { data[child] = []; counts[child] = 0; continue; }

        const { data: rows } = await supabase
            .from(child)
            .select('*')
            .in(fk, parentIds);

        data[child] = rows || [];
        counts[child] = (rows || []).length;
    }

    // Build payload
    const payload = JSON.stringify({
        version: BACKUP_VERSION,
        app: 'bc-money',
        created_at: new Date().toISOString(),
        user_id: userId,
        data,
    });

    // Encrypt
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload));

    // Build .mafe file: MAGIC(4) + SALT(16) + IV(12) + ENCRYPTED(rest)
    const result = new Uint8Array(4 + 16 + 12 + encrypted.byteLength);
    result.set(MAGIC, 0);
    result.set(salt, 4);
    result.set(iv, 20);
    result.set(new Uint8Array(encrypted), 32);

    const date = new Date().toISOString().slice(0, 10);
    return {
        blob: new Blob([result], { type: 'application/octet-stream' }),
        filename: `bc-money-backup-${date}.mafe`,
        tables: counts,
    };
}

export async function restoreBackup(file: File, password: string, userId: string): Promise<{ tables: Record<string, number> }> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // Validate magic
    if (bytes.length < 33 || bytes[0] !== 0x4D || bytes[1] !== 0x41 || bytes[2] !== 0x46 || bytes[3] !== 0x45) {
        throw new Error('Archivo no válido. Solo se aceptan archivos .mafe generados por BC Money.');
    }

    // Extract parts
    const salt = bytes.slice(4, 20);
    const iv = bytes.slice(20, 32);
    const encrypted = bytes.slice(32);

    // Decrypt
    const key = await deriveKey(password, salt);
    let decrypted: ArrayBuffer;
    try {
        decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
    } catch {
        throw new Error('Contraseña incorrecta. No se pudo descifrar el archivo.');
    }

    const payload = JSON.parse(new TextDecoder().decode(decrypted));

    if (payload.app !== 'bc-money') {
        throw new Error('Este archivo no pertenece a BC Money.');
    }

    const data: Record<string, unknown[]> = payload.data;
    const counts: Record<string, number> = {};

    // Restore order: parents first, then children
    const parentTables = ['categories', 'accounts', 'goals', 'budgets', 'debts', 'warranties', 'pets', 'shopping_lists', 'home_items', 'transactions'];
    const childTablesOrder = ['debt_payments', 'pet_events', 'shopping_items', 'home_maintenance'];

    // Delete existing data in reverse order (children first)
    for (const table of [...childTablesOrder].reverse()) {
        await supabase.from(table).delete().eq('user_id', userId);
    }
    for (const table of [...parentTables].reverse()) {
        await supabase.from(table).delete().eq('user_id', userId);
    }

    // Insert parent tables
    for (const table of parentTables) {
        const rows = data[table];
        if (!rows || rows.length === 0) { counts[table] = 0; continue; }

        // Replace user_id with current user
        const mapped = rows.map((r: any) => ({ ...r, user_id: userId }));

        // Insert in batches of 100
        for (let i = 0; i < mapped.length; i += 100) {
            const batch = mapped.slice(i, i + 100);
            const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
            if (error) console.warn(`Error restoring ${table}:`, error.message);
        }
        counts[table] = rows.length;
    }

    // Insert child tables
    for (const table of childTablesOrder) {
        const rows = data[table];
        if (!rows || rows.length === 0) { counts[table] = 0; continue; }

        const mapped = rows.map((r: any) => ({ ...r, user_id: userId }));

        for (let i = 0; i < mapped.length; i += 100) {
            const batch = mapped.slice(i, i + 100);
            const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
            if (error) console.warn(`Error restoring ${table}:`, error.message);
        }
        counts[table] = rows.length;
    }

    return { tables: counts };
}
