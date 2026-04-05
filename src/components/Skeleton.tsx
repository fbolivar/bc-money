import './Skeleton.css';

export function SkeletonCard({ count = 3 }: { count?: number }) {
    return (
        <div className="skeleton-grid">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="skeleton-card">
                    <div className="sk-row"><div className="sk-circle" /><div className="sk-lines"><div className="sk-line w60" /><div className="sk-line w40" /></div></div>
                    <div className="sk-line w100 tall" />
                    <div className="sk-line w80" />
                </div>
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="skeleton-table">
            <div className="sk-table-header"><div className="sk-line w20" /><div className="sk-line w30" /><div className="sk-line w20" /><div className="sk-line w15" /></div>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="sk-table-row"><div className="sk-line w20" /><div className="sk-line w30" /><div className="sk-line w20" /><div className="sk-line w15" /></div>
            ))}
        </div>
    );
}

export function SkeletonDashboard() {
    return (
        <div className="skeleton-dash">
            <div className="sk-metrics">{Array.from({ length: 4 }, (_, i) => <div key={i} className="sk-metric" />)}</div>
            <div className="sk-charts"><div className="sk-chart" /><div className="sk-chart" /></div>
            <div className="sk-chart wide" />
        </div>
    );
}

export function SkeletonPage() {
    return (
        <div className="skeleton-page">
            <div className="sk-header"><div className="sk-line w40 tall" /><div className="sk-line w20" /></div>
            <SkeletonCard count={4} />
        </div>
    );
}
