import { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useHR } from '@/hooks/useHR';
import { formatDate } from '@/lib/db';
import { supabase } from '@/lib/supabase'; // Need direct access for user list loading

export default function HRPage() {
    const { user, loading: authLoading } = useAuth();
    const {
        shifts, attendanceHistory, currentSession, loading: hrLoading,
        clockIn, clockOut, createShift, deleteShift
    } = useHR(user?.id);

    const [activeTab, setActiveTab] = useState('attendance'); // attendance, shifts, report
    const [clockNote, setClockNote] = useState('');
    const [showShiftModal, setShowShiftModal] = useState(false);

    // Shift Form
    const [allUsers, setAllUsers] = useState([]); // For dropdown
    const [shiftForm, setShiftForm] = useState({
        user_id: '',
        start_date: '',
        start_time: '08:00',
        end_time: '16:00',
        title: 'Morning Shift'
    });

    useEffect(() => {
        if (!authLoading && !user) window.location.href = '/';
        loadUsers();
    }, [user, authLoading]);

    async function loadUsers() {
        const { data } = await supabase.from('users').select('id, name');
        if (data) setAllUsers(data);
    }

    // --- Actions ---
    const handleClockIn = async () => {
        try {
            await clockIn(clockNote);
            setClockNote('');
            alert('Berhasil Clock In! Selamat bekerja.');
        } catch (error) {
            alert('Gagal: ' + error.message);
        }
    };

    const handleClockOut = async () => {
        try {
            await clockOut(clockNote);
            setClockNote('');
            alert('Berhasil Clock Out! Sampai jumpa.');
        } catch (error) {
            alert('Gagal: ' + error.message);
        }
    };

    const handleCreateShift = async (e) => {
        e.preventDefault();
        try {
            // Combine date and time
            const start = new Date(`${shiftForm.start_date}T${shiftForm.start_time}:00`);
            const end = new Date(`${shiftForm.start_date}T${shiftForm.end_time}:00`);

            await createShift({
                user_id: shiftForm.user_id,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                title: shiftForm.title
            });
            setShowShiftModal(false);
        } catch (error) {
            alert('Gagal: ' + error.message);
        }
    };

    // --- Render Helpers ---
    const formatTime = (isoString) => {
        if (!isoString) return '-';
        return new Date(isoString).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    };

    const duration = (start, end) => {
        if (!start || !end) return '-';
        const diff = new Date(end) - new Date(start);
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        return `${hours}j ${mins}m`;
    };

    if (authLoading || hrLoading) return <div className="p-xl text-center">Memuat HR Modules...</div>;

    const isAdmin = user?.role === 'admin';

    // Filter History: My Attendance vs All (if admin)
    // Actually, let's just show My Attendance in the main tab, and All in Report tab
    const myHistory = attendanceHistory.filter(a => a.user_id === user?.id);

    return (
        <div className="app-container">
            <Sidebar activePage="hr" />
            <main className="main-content">
                <header className="page-header">
                    <div>
                        <h1 className="page-title">Employee & HR</h1>
                        <p className="text-secondary text-sm">Absensi dan Jadwal Kerja</p>
                    </div>
                </header>

                <div style={{ padding: 'var(--spacing-xl)' }}>

                    {/* Tabs */}
                    <div className="flex justify-between items-center mb-lg">
                        <div className="flex gap-sm tabs-container">
                            <button className={`btn ${activeTab === 'attendance' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('attendance')}>⏱️ Absensi Saya</button>
                            <button className={`btn ${activeTab === 'shifts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('shifts')}>📅 Jadwal Shift</button>
                            {isAdmin && (
                                <button className={`btn ${activeTab === 'report' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('report')}>📊 Rekap (Admin)</button>
                            )}
                        </div>
                    </div>

                    {/* --- TAB: ATTENDANCE --- */}
                    {activeTab === 'attendance' && (
                        <div className="hr-grid">
                            {/* Clock In/Out Card */}
                            <div className="card text-center" style={{ padding: '40px 20px' }}>
                                <div style={{ fontSize: '64px', marginBottom: '16px' }}>
                                    {currentSession ? '🏢' : '🏠'}
                                </div>
                                <h2 style={{ marginBottom: '8px' }}>
                                    {currentSession ? 'Anda Sedang Bekerja' : 'Anda Belum Masuk'}
                                </h2>
                                <p className="text-secondary mb-lg">
                                    {currentSession
                                        ? `Masuk sejak: ${formatTime(currentSession.clock_in)}`
                                        : 'Silakan Clock In untuk mulai bekerja.'}
                                </p>

                                <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                                    <input
                                        type="text"
                                        className="input mb-md text-center"
                                        placeholder="Catatan (Opsional)..."
                                        value={clockNote}
                                        onChange={e => setClockNote(e.target.value)}
                                    />

                                    {currentSession ? (
                                        <button className="btn btn-error btn-xl w-full" onClick={handleClockOut}>
                                            🛑 CLOCK OUT
                                        </button>
                                    ) : (
                                        <button className="btn btn-success btn-xl w-full" onClick={handleClockIn}>
                                            ✅ CLOCK IN
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* My History */}
                            <div className="card">
                                <div className="card-header">
                                    <h3>Riwayat Absensi Saya</h3>
                                </div>
                                <div className="card-body p-0">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Tanggal</th>
                                                <th>Masuk</th>
                                                <th>Keluar</th>
                                                <th>Durasi</th>
                                                <th>Ket</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {myHistory.map(a => (
                                                <tr key={a.id}>
                                                    <td>{formatDate(a.clock_in)}</td>
                                                    <td>{formatTime(a.clock_in)}</td>
                                                    <td>{formatTime(a.clock_out)}</td>
                                                    <td>{duration(a.clock_in, a.clock_out)}</td>
                                                    <td className="text-xs text-secondary">{a.notes}</td>
                                                </tr>
                                            ))}
                                            {myHistory.length === 0 && (
                                                <tr><td colSpan="5" className="text-center p-md text-secondary">Belum ada riwayat.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- TAB: SHIFTS --- */}
                    {activeTab === 'shifts' && (
                        <div className="card">
                            <div className="card-header flex justify-between">
                                <h3>Jadwal Shift Karyawan</h3>
                                {isAdmin && (
                                    <button className="btn btn-primary btn-sm" onClick={() => setShowShiftModal(true)}>+ Buat Shift</button>
                                )}
                            </div>
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Tanggal</th>
                                            <th>Karyawan</th>
                                            <th>Shift</th>
                                            <th>Jam</th>
                                            {isAdmin && <th>Aksi</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {shifts.map(s => (
                                            <tr key={s.id}>
                                                <td>{formatDate(s.start_time)}</td>
                                                <td style={{ fontWeight: 'bold' }}>{s.users?.name}</td>
                                                <td><span className="badge">{s.title}</span></td>
                                                <td>{formatTime(s.start_time)} - {formatTime(s.end_time)}</td>
                                                {isAdmin && (
                                                    <td>
                                                        <button className="btn btn-sm btn-ghost text-error" onClick={() => deleteShift(s.id)}>🗑️</button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- TAB: REPORT (ADMIN) --- */}
                    {activeTab === 'report' && isAdmin && (
                        <div className="card">
                            <div className="card-header">
                                <h3>Rekap Absensi Semua Karyawan</h3>
                            </div>
                            <div className="card-body p-0">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Karyawan</th>
                                            <th>Tanggal</th>
                                            <th>Masuk</th>
                                            <th>Keluar</th>
                                            <th>Durasi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attendanceHistory.map(a => (
                                            <tr key={a.id}>
                                                <td style={{ fontWeight: 'bold' }}>{a.users?.name}</td>
                                                <td>{formatDate(a.clock_in)}</td>
                                                <td>{formatTime(a.clock_in)}</td>
                                                <td>{formatTime(a.clock_out)}</td>
                                                <td>{duration(a.clock_in, a.clock_out)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* SHIFT MODAL */}
            {showShiftModal && (
                <div className="modal-overlay" onClick={() => setShowShiftModal(false)}>
                    <div className="modal" style={{ width: '400px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Buat Jadwal Shift</h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowShiftModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateShift}>
                            <div className="modal-body">
                                <div className="form-group mb-md">
                                    <label>Karyawan</label>
                                    <select
                                        className="input"
                                        required
                                        value={shiftForm.user_id}
                                        onChange={e => setShiftForm({ ...shiftForm, user_id: e.target.value })}
                                    >
                                        <option value="">-- Pilih Karyawan --</option>
                                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group mb-md">
                                    <label>Nama Shift</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={shiftForm.title}
                                        onChange={e => setShiftForm({ ...shiftForm, title: e.target.value })}
                                    />
                                </div>
                                <div className="form-group mb-md">
                                    <label>Tanggal</label>
                                    <input
                                        type="date"
                                        className="input"
                                        required
                                        value={shiftForm.start_date}
                                        onChange={e => setShiftForm({ ...shiftForm, start_date: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div className="form-group">
                                        <label>Jam Masuk</label>
                                        <input
                                            type="time"
                                            className="input"
                                            required
                                            value={shiftForm.start_time}
                                            onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Jam Pulang</label>
                                        <input
                                            type="time"
                                            className="input"
                                            required
                                            value={shiftForm.end_time}
                                            onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="submit" className="btn btn-primary">Simpan Jadwal</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
