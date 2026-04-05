import { useState } from 'react';
import { Copy, CheckCircle, Code, Lock, Database, Globe } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import './ApiDocs.css';

const API_BASE = import.meta.env.VITE_SUPABASE_URL || '';

const ENDPOINTS = [
    { method: 'GET', path: '/rest/v1/transactions', desc: 'Listar transacciones', params: 'select=*&order=date.desc&limit=100' },
    { method: 'POST', path: '/rest/v1/transactions', desc: 'Crear transacción', body: '{"type":"expense","amount":50000,"description":"Compra","date":"2024-01-15","payment_method":"debit"}' },
    { method: 'GET', path: '/rest/v1/accounts', desc: 'Listar cuentas', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/categories', desc: 'Listar categorías', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/budgets', desc: 'Listar presupuestos', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/goals', desc: 'Listar metas', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/debts', desc: 'Listar deudas', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/subscriptions', desc: 'Listar suscripciones', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/investments', desc: 'Listar inversiones', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/warranties', desc: 'Listar garantías', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/pets', desc: 'Listar mascotas', params: 'select=*' },
    { method: 'GET', path: '/rest/v1/net_worth_snapshots', desc: 'Historial patrimonio', params: 'select=*&order=date.asc' },
];

export function ApiDocs() {
    const { user } = useAuth();
    const [copied, setCopied] = useState('');
    const [testResult, setTestResult] = useState<string | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    function copyToClipboard(text: string, id: string) {
        navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(''), 2000);
    }

    async function testEndpoint(endpoint: typeof ENDPOINTS[0]) {
        setTestLoading(true);
        setTestResult(null);
        try {
            const url = `${API_BASE}${endpoint.path}?${endpoint.params || ''}`;
            const res = await fetch(url, {
                headers: {
                    'apikey': anonKey,
                    'Authorization': `Bearer ${(await (await import('../lib/supabase')).supabase.auth.getSession()).data.session?.access_token || ''}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await res.json();
            setTestResult(JSON.stringify(data, null, 2).slice(0, 2000));
        } catch (err) {
            setTestResult(`Error: ${err}`);
        }
        setTestLoading(false);
    }

    return (
        <div className="api-page animate-fadeIn">
            <div className="api-header">
                <div><h1>API REST</h1><p>Documentación de la API para integraciones externas</p></div>
            </div>

            {/* Auth Info */}
            <div className="api-card auth-card">
                <div className="api-card-header"><Lock size={20} /><h3>Autenticación</h3></div>
                <p>Todas las peticiones requieren dos headers:</p>
                <div className="api-code-block">
                    <code>apikey: {anonKey.slice(0, 20)}...{anonKey.slice(-10)}</code>
                    <button type="button" className="api-copy-btn" title="Copiar" onClick={() => copyToClipboard(anonKey, 'apikey')}>
                        {copied === 'apikey' ? <CheckCircle size={14} /> : <Copy size={14} />}
                    </button>
                </div>
                <div className="api-code-block">
                    <code>Authorization: Bearer {'<'}tu_jwt_token{'>'}</code>
                </div>
                <p className="api-note">El JWT token se obtiene al iniciar sesión con <code>POST /auth/v1/token?grant_type=password</code></p>
            </div>

            {/* Base URL */}
            <div className="api-card">
                <div className="api-card-header"><Globe size={20} /><h3>URL Base</h3></div>
                <div className="api-code-block">
                    <code>{API_BASE}</code>
                    <button type="button" className="api-copy-btn" title="Copiar" onClick={() => copyToClipboard(API_BASE, 'base')}>
                        {copied === 'base' ? <CheckCircle size={14} /> : <Copy size={14} />}
                    </button>
                </div>
            </div>

            {/* Endpoints */}
            <div className="api-card">
                <div className="api-card-header"><Database size={20} /><h3>Endpoints Disponibles</h3></div>
                <div className="api-endpoints">
                    {ENDPOINTS.map((ep, i) => {
                        const curlCmd = `curl -X ${ep.method} "${API_BASE}${ep.path}${ep.params ? '?' + ep.params : ''}" -H "apikey: ${anonKey}" -H "Authorization: Bearer YOUR_TOKEN"${ep.body ? ` -H "Content-Type: application/json" -d '${ep.body}'` : ''}`;
                        return (
                            <div key={i} className="api-endpoint">
                                <div className="api-ep-header">
                                    <span className={`api-method ${ep.method.toLowerCase()}`}>{ep.method}</span>
                                    <code className="api-path">{ep.path}</code>
                                    <span className="api-desc">{ep.desc}</span>
                                </div>
                                <div className="api-ep-actions">
                                    <button type="button" className="api-action-btn" onClick={() => copyToClipboard(curlCmd, `curl-${i}`)}>
                                        {copied === `curl-${i}` ? <CheckCircle size={12} /> : <Copy size={12} />} cURL
                                    </button>
                                    <button type="button" className="api-action-btn test" onClick={() => testEndpoint(ep)} disabled={testLoading}>
                                        <Code size={12} /> Probar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Test Result */}
            {testResult && (
                <div className="api-card">
                    <div className="api-card-header"><Code size={20} /><h3>Resultado</h3></div>
                    <pre className="api-result">{testResult}</pre>
                </div>
            )}

            {/* Usage Example */}
            <div className="api-card">
                <div className="api-card-header"><Code size={20} /><h3>Ejemplo JavaScript</h3></div>
                <pre className="api-example">{`// Obtener transacciones
const response = await fetch(
  '${API_BASE}/rest/v1/transactions?select=*&order=date.desc&limit=10',
  {
    headers: {
      'apikey': 'YOUR_ANON_KEY',
      'Authorization': 'Bearer YOUR_JWT_TOKEN',
    },
  }
);
const data = await response.json();
console.log(data);

// Crear transacción
const newTx = await fetch(
  '${API_BASE}/rest/v1/transactions',
  {
    method: 'POST',
    headers: {
      'apikey': 'YOUR_ANON_KEY',
      'Authorization': 'Bearer YOUR_JWT_TOKEN',
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      type: 'expense',
      amount: 25000,
      description: 'Almuerzo',
      date: '${new Date().toISOString().slice(0, 10)}',
      payment_method: 'cash',
    }),
  }
);`}</pre>
            </div>
        </div>
    );
}
