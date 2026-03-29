const STORES = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S008', 'S009', 'S010'];

export default function StoreSelector({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 text-sm font-bold cursor-pointer outline-none uppercase"
      style={{ backgroundColor: '#fff', color: '#000', border: '2px solid #000' }}
    >
      {STORES.map(s => (
        <option key={s} value={s}>Store {s}</option>
      ))}
    </select>
  );
}
