/**
 * Every string a user can read lives here, in Indonesian. Code, database
 * columns and comments stay English on purpose; this file is the seam between
 * the two.
 */

export const t = {
  app: {
    name: 'Bel Kelas',
    tagline: 'Rebutan jawaban, langsung dari HP masing-masing',
  },

  phase: {
    WAITING: 'Menunggu permainan',
    READY_CHECK: 'Menunggu kesiapan siswa',
    COUNTDOWN: 'Bersiap',
    BUZZER_ACTIVE: 'Buzzer aktif',
    ROUND_COMPLETE: 'Ronde selesai',
    PAUSED: 'Permainan dijeda',
    GAME_OVER: 'Permainan selesai',
  },

  connection: {
    connecting: 'Menghubungkan…',
    connected: 'Terhubung',
    reconnecting: 'Menghubungkan kembali…',
    offline: 'Terputus',
    waitingForConnection: 'Menunggu koneksi…',
    syncing: 'Menyinkronkan permainan…',
    staleWarning: 'Koneksi tersendat. Tunggu sampai tersambung lagi sebelum menekan buzzer.',
    restored: 'Koneksi kembali normal',
  },

  student: {
    greeting: (name: string) => `Halo, ${name}`,
    waitingTitle: 'Menunggu permainan',
    waitingBody: 'Jangan tutup halaman ini. Buzzer akan menyala sendiri.',
    readyQuestion: 'Siap bermain?',
    readyButton: 'Saya siap',
    readyConfirmed: 'Anda siap',
    readyWaiting: 'Menunggu guru memulai permainan…',
    notReadyYet: 'Belum siap',
    cancelReady: 'Batalkan',
    buzz: 'BUZZ!',
    buzzed: 'ANDA MENEKAN!',
    buzzedBody: 'Tunggu keputusan guru.',
    youWon: 'ANDA MENANG!',
    youWonBody: 'Silakan jawab pertanyaannya.',
    tooLate: 'TERLAMBAT!',
    roundOver: 'Ronde selesai',
    someoneElseWon: (name: string) => `${name} menekan tombol terlebih dahulu.`,
    roundOverNoWinner: 'Belum ada yang menekan buzzer di ronde ini.',
    excluded: 'Kesempatan Anda di ronde ini sudah terpakai. Tunggu ronde berikutnya.',
    paused: 'Permainan dijeda',
    pausedBody: 'Harap tunggu guru melanjutkan permainan.',
    gameOver: 'Permainan selesai',
    gameOverBody: 'Terima kasih sudah bermain!',
    getReady: 'Bersiap…',
    round: (n: number) => `Ronde ${n}`,
    disabled: 'Buzzer belum aktif',
    tapEarly: 'Buzzer belum aktif. Tunggu aba-aba.',
    yourScore: (n: number) => `${n} poin`,
    yourRank: (n: number) => `Peringkat ${n}`,
    standings: 'Klasemen',
  },

  admin: {
    createTitle: 'Buat permainan baru',
    createSubtitle: 'Buat tautan untuk setiap siswa. Siswa tidak perlu mendaftar atau masuk.',
    studentCount: 'Jumlah siswa',
    namesLabel: 'Nama siswa',
    namesHelp: 'Satu nama per baris. Baris kosong akan diberi nama otomatis.',
    namesPlaceholder: 'Andi\nBudi\nCitra\nDimas',
    createButton: 'Buat permainan',
    creating: 'Membuat permainan…',
    resumeTitle: 'Lanjutkan permainan',
    resumeBody: 'Permainan yang tersimpan di perangkat ini.',
    openDashboard: 'Buka panel guru',
    forget: 'Hapus dari daftar',

    dashboardTitle: 'Panel guru',
    round: 'Ronde',
    status: 'Status',
    connected: 'Siswa terhubung',
    ready: 'Siswa siap',
    buzzedCount: 'Sudah menekan',
    winner: 'Pemenang',
    noWinnerYet: 'Belum ada',
    joinCode: 'Kode permainan',

    nextRound: 'Ronde berikutnya',
    enableBuzzer: 'Aktifkan buzzer',
    disableBuzzer: 'Matikan buzzer',
    awardPoint: 'Berikan poin',
    pointAwarded: 'Poin sudah diberikan',
    undoWinner: 'Batalkan pemenang',
    reopenBuzzer: 'Buka buzzer lagi',
    endRound: 'Akhiri ronde',
    pause: 'Jeda permainan',
    resume: 'Lanjutkan permainan',
    endGame: 'Akhiri permainan',
    clearGame: 'Hapus permainan',
    startFirstRound: 'Mulai ronde pertama',

    tabs: {
      control: 'Kendali',
      students: 'Siswa',
      links: 'Tautan',
      leaderboard: 'Klasemen',
      history: 'Riwayat',
      settings: 'Pengaturan',
    },

    linksTitle: 'Tautan siswa',
    linksHelp: 'Bagikan satu tautan ke setiap siswa. Tautan bersifat rahasia dan sulit ditebak.',
    copyLink: 'Salin',
    copied: 'Tersalin',
    copyAll: 'Salin semua tautan',
    addStudents: 'Tambah siswa',
    rename: 'Ubah nama',
    saveName: 'Simpan',

    readyBadge: 'Siap',
    rosterTitle: 'Status siswa',
    rosterEmpty: 'Belum ada siswa.',
    connectedOf: (a: number, b: number) => `${a} / ${b} siswa terhubung`,
    readyOf: (a: number, b: number) => `${a} / ${b} siswa siap`,
    seat: 'No.',
    name: 'Nama',
    score: 'Poin',
    wins: 'Menang',
    rank: 'Peringkat',
    lastSeen: 'Terakhir terlihat',
    buzzedAt: 'Menekan',
    excludedBadge: 'Sudah dapat kesempatan',

    leaderboardTitle: 'Klasemen',
    leaderboardEmpty: 'Belum ada poin. Klasemen muncul setelah ronde pertama.',
    leaderboardHidden: 'Klasemen langsung sedang dimatikan di Pengaturan.',
    finalResults: 'Hasil akhir',
    finalResultsBody: 'Permainan sudah selesai.',

    historyTitle: 'Riwayat permainan',
    historyEmpty: 'Belum ada kejadian.',

    settingsTitle: 'Pengaturan permainan',
    settingPoints: 'Poin untuk kemenangan',
    settingBuzzerMode: 'Mode buzzer',
    settingBuzzerManual: 'Manual',
    settingBuzzerAuto: 'Otomatis saat ronde dimulai',
    settingCountdown: 'Hitungan mundur',
    settingCountdownNone: 'Tidak ada',
    settingCountdown3: '3 detik',
    settingCountdown5: '5 detik',
    settingSound: 'Efek suara',
    settingLiveLeaderboard: 'Tampilkan klasemen selama permainan',
    settingStudentLeaderboard: 'Siswa boleh melihat klasemen',
    settingRequireReady: 'Wajib semua siswa siap',
    settingAwardMode: 'Pemberian poin',
    settingAwardAuto: 'Otomatis saat menang',
    settingAwardManual: 'Setelah guru menyetujui jawaban',
    settingExcludePrevious: 'Kunci siswa sebelumnya saat buzzer dibuka lagi',
    settingsSaved: 'Pengaturan disimpan',

    confirmEndGameTitle: 'Akhiri permainan ini?',
    confirmEndGameBody:
      'Semua siswa akan diberi tahu dan tidak ada buzzer yang diterima lagi. Hasil akhir akan ditampilkan.',
    confirmClearTitle: 'Hapus permainan ini?',
    confirmClearBody:
      'Seluruh siswa, ronde, poin, dan riwayat permainan ini akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.',
    confirmClearAck: 'Saya mengerti data permainan akan hilang',
    confirmUndoTitle: 'Batalkan pemenang terakhir?',
    confirmUndoBody: (name: string) =>
      `Kemenangan ${name} pada ronde ini akan dibatalkan beserta poinnya. Riwayat tetap tersimpan.`,
    confirmReopenTitle: 'Buka buzzer lagi?',
    confirmReopenBody: (name: string) =>
      `${name} kehilangan kesempatan di ronde ini dan siswa lain boleh menekan buzzer.`,
    cancel: 'Batal',

    wrongAnswerTitle: 'Jawaban salah atau terlalu lama?',
    wrongAnswerBody: 'Pilih untuk mengakhiri ronde atau membuka buzzer untuk siswa lain.',

    notAllReady: (ready: number, total: number) =>
      `Baru ${ready} dari ${total} siswa yang siap. Matikan "Wajib semua siswa siap" di Pengaturan untuk tetap memulai.`,
  },

  events: {
    game_created: 'Permainan dibuat',
    student_link_created: (n: string) => `Tautan untuk ${n} dibuat`,
    student_connected: (n: string) => `${n} terhubung`,
    student_disconnected: (n: string) => `${n} terputus`,
    student_ready: (n: string) => `${n} siap`,
    student_unready: (n: string) => `${n} membatalkan kesiapan`,
    student_renamed: (from: string, to: string) => `Nama ${from} diubah menjadi ${to}`,
    round_started: (r: number) => `Ronde ${r} dimulai`,
    buzzer_enabled: 'Buzzer diaktifkan',
    buzzer_enabled_auto: 'Buzzer diaktifkan otomatis',
    buzzer_disabled: 'Buzzer dimatikan',
    student_buzzed_first: (n: string) => `${n} menekan buzzer`,
    student_buzzed_late: (n: string) => `${n} menekan buzzer (terlambat)`,
    winner_determined: (n: string, r: number) => `${n} memenangkan ronde ${r}`,
    points_awarded: (n: string, p: number) => `${n} mendapat ${p} poin`,
    winner_undone: (n: string) => `Guru membatalkan kemenangan ${n}`,
    buzzer_reopened: (n: string) => `Guru membuka buzzer kembali setelah ${n}`,
    game_paused: 'Permainan dijeda',
    game_resumed: 'Permainan dilanjutkan',
    game_ended: 'Permainan diakhiri',
    settings_updated: 'Pengaturan diubah',
    unknown: (type: string) => `Kejadian: ${type}`,
  },

  errors: {
    generic: 'Terjadi kesalahan. Coba lagi sebentar.',
    network: 'Koneksi ke server gagal. Periksa jaringan Anda.',
    invalidLink: 'Tautan tidak dikenal',
    invalidLinkBody:
      'Tautan ini tidak cocok dengan permainan mana pun. Minta tautan baru kepada guru Anda.',
    gameMissing: 'Permainan tidak ditemukan',
    gameMissingBody: 'Permainan ini sudah dihapus oleh guru.',
    unauthorized: 'Anda tidak punya akses ke panel guru permainan ini.',
    buzz: {
      game_ended: 'Permainan sudah selesai.',
      game_paused: 'Permainan sedang dijeda.',
      game_not_started: 'Permainan belum dimulai.',
      no_round: 'Belum ada ronde yang berjalan.',
      buzzer_closed: 'Buzzer sudah ditutup.',
      too_early: 'Buzzer belum aktif.',
      excluded: 'Kesempatan Anda di ronde ini sudah terpakai.',
      no_game: 'Permainan tidak ditemukan.',
    },
    admin: {
      game_ended: 'Permainan sudah selesai.',
      game_paused: 'Lanjutkan permainan terlebih dahulu.',
      game_not_active: 'Permainan belum berjalan.',
      game_not_paused: 'Permainan tidak sedang dijeda.',
      no_round: 'Mulai ronde terlebih dahulu.',
      no_winner: 'Belum ada pemenang di ronde ini.',
      round_has_winner: 'Ronde ini sudah punya pemenang.',
      round_complete: 'Ronde ini sudah ditutup.',
      buzzer_not_armed: 'Buzzer sedang tidak aktif.',
      already_awarded: 'Poin untuk ronde ini sudah diberikan.',
      not_all_ready: 'Belum semua siswa siap.',
      student_not_found: 'Siswa tidak ditemukan.',
      no_students: 'Masukkan minimal satu siswa.',
      too_many_students: 'Jumlah siswa terlalu banyak (maksimal 200).',
    },
  },

  common: {
    loading: 'Memuat…',
    retry: 'Coba lagi',
    back: 'Kembali',
    close: 'Tutup',
    on: 'Aktif',
    off: 'Mati',
    soundOn: 'Suara aktif',
    soundOff: 'Suara mati',
    of: 'dari',
    points: 'poin',
  },
} as const;

/** Maps a database error code / RPC error string to Indonesian. */
export function adminErrorMessage(code: string | undefined): string {
  if (!code) return t.errors.generic;
  const table = t.errors.admin as Record<string, string | undefined>;
  return table[code] ?? t.errors.generic;
}

export function buzzErrorMessage(reason: string | undefined): string {
  if (!reason) return t.errors.generic;
  const table = t.errors.buzz as Record<string, string | undefined>;
  return table[reason] ?? t.errors.generic;
}
