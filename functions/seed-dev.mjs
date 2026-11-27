// SEMENTARA (dev): isi emulator lokal dengan HRD + beberapa karyawan supaya halaman
// HRD (kelola divisi, jadwal, absensi) bisa diperiksa lewat browser.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const PROJECT = 'hybrid-lamp-f2l12';
const DBID = 'ai-studio-ptsinarbungamasa-df6f62f5-f72a-4811-b3c7-0e5c822f6913';

const app = initializeApp({ projectId: PROJECT }, 'seed-dev');
const db = getFirestore(app, DBID);
const auth = getAuth(app);

const PASSWORD = 'AdminE2E#2026';
const today = '2026-07-01';
const now = Timestamp.now();

const PEOPLE = [
  { email: 'fikriramadhan998@gmail.com', name: 'Fikri Ramadhan', nik: 'ADMIN01', role: 'hrd', division: 'HRD', position: 'HR Manager', shiftCode: 'REGULER', active: true, salary: 9000000 },
  { email: 'supervisor.security@e2e.test', name: 'Dedi Kurniawan', nik: 'E2E0100', role: 'supervisor', division: 'Security', position: 'Supervisor Security', shiftCode: 'SECURITY24', active: true, salary: 6500000 },
  { email: 'budi.aktif@e2e.test', name: 'Budi Santoso', nik: 'E2E0101', role: 'employee', division: 'Security', position: 'Petugas Security', shiftCode: 'SECURITY24', active: true, salary: 5000000, supervisor: 'supervisor.security@e2e.test' },
  { email: 'siti.aktif@e2e.test', name: 'Siti Aminah', nik: 'E2E0102', role: 'employee', division: 'Cleaning Service', position: 'Petugas Kebersihan', shiftCode: 'PAGI', active: true, salary: 4200000 },
  { email: 'agus.aktif@e2e.test', name: 'Agus Setiawan', nik: 'E2E0103', role: 'employee', division: 'Operasional', position: 'Staff Operasional', shiftCode: 'REGULER', active: true, salary: 4800000 },
  { email: 'rina.nonaktif@e2e.test', name: 'Rina Marlina', nik: 'E2E0104', role: 'employee', division: 'Keuangan', position: 'Staff Keuangan', shiftCode: 'REGULER', active: false, salary: 5200000 },
];

const uidByEmail = {};
for (const person of PEOPLE) {
  let user = await auth.getUserByEmail(person.email).catch(() => null);
  if (!user) user = await auth.createUser({ email: person.email, password: PASSWORD, emailVerified: true });
  else await auth.updateUser(user.uid, { password: PASSWORD, emailVerified: true, disabled: false });
  uidByEmail[person.email] = user.uid;
}

for (const person of PEOPLE) {
  const uid = uidByEmail[person.email];
  await db.doc(`employees/${uid}`).set({
    uid,
    nik: person.nik,
    name: person.name,
    position: person.position,
    division: person.division,
    role: person.role,
    shiftCode: person.shiftCode,
    email: person.email,
    phone: '081200000000',
    address: 'Jakarta',
    joinDate: '2026-01-01',
    contractType: 'PKWT',
    contractEnd: '2027-01-01',
    contractSigned: true,
    contractSignedAt: '2026-01-01',
    baseSalary: person.salary,
    positionAllowance: 500000,
    mealTransportAllowance: 500000,
    leaveQuota: 12,
    active: person.active,
    ...(person.supervisor ? { supervisorUid: uidByEmail[person.supervisor] } : {}),
    createdAt: now,
    updatedAt: now,
  });

  if (person.role !== 'hrd' && person.division === 'Security') {
    await db.doc(`schedules/SCH-${uid}-${today}`).set({
      uid,
      nik: person.nik,
      date: today,
      shiftCode: person.shiftCode,
      location: 'Pos Utama',
      notes: 'Patroli rutin',
      patrolCompleted: false,
      createdAt: now,
      updatedAt: now,
    });
  }
}

// Beberapa pengajuan menunggu supaya badge & panel review terisi.
const budi = uidByEmail['budi.aktif@e2e.test'];
const dedi = uidByEmail['supervisor.security@e2e.test'];
await db.doc('leaves/SEED-LEAVE-1').set({
  uid: budi,
  nik: 'E2E0101',
  employeeName: 'Budi Santoso',
  division: 'Security',
  type: 'Cuti Tahunan',
  startDate: '2026-07-10',
  endDate: '2026-07-11',
  days: 2,
  reason: 'Acara keluarga di kampung',
  status: 'Menunggu',
  createdLabel: '1 Jul 2026',
  reviewedBy: '',
  supervisorUid: dedi,
  createdAt: now,
  updatedAt: now,
});
await db.doc('overtimes/SEED-OT-1').set({
  uid: budi,
  nik: 'E2E0101',
  employeeName: 'Budi Santoso',
  division: 'Security',
  date: today,
  startTime: '18:00',
  endTime: '21:00',
  hours: 3,
  estimatedPay: 225000,
  reason: 'Pergantian pos mendadak',
  status: 'Menunggu',
  createdLabel: '1 Jul 2026',
  reviewedBy: '',
  supervisorUid: dedi,
  createdAt: now,
  updatedAt: now,
});

console.log(
  JSON.stringify(
    {
      seeded: PEOPLE.map((p) => `${p.role}:${p.email}`),
      password: PASSWORD,
      hrdUid: uidByEmail['fikriramadhan998@gmail.com'],
      supervisorUid: dedi,
    },
    null,
    1
  )
);
process.exit(0);
