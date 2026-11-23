/* NURSECARE — Firebase shared academic prototype */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMqpTAZ2zeHbBxdD68oo4ginQT-9AUmRE",
  authDomain: "nursecare-ukwms.firebaseapp.com",
  projectId: "nursecare-ukwms",
  storageBucket: "nursecare-ukwms.firebasestorage.app",
  messagingSenderId: "1057453627705",
  appId: "1:1057453627705:web:3e70dc74f7383b54d170e8",
  measurementId: "G-2WRQLW52E1"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const $ = id => document.getElementById(id);
const patientsRef = collection(db, "patients");
const recordsRef = collection(db, "records");
let patientData = [];
let recordData = [];
let activeUser = null;
let toastTimer;

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}
function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function today() { return new Date().toISOString().slice(0, 10); }
function showAuth(mode) {
  $("authScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("loginView").classList.toggle("hidden", mode !== "login");
  $("registerView").classList.toggle("hidden", mode !== "register");
}
function enterApp(user) {
  const name = user.displayName || user.email || "Pengguna";
  $("authScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("sideUser").textContent = name;
  $("welcomeName").textContent = name.split(" ")[0];
  $("sideAvatar").textContent = name.charAt(0).toUpperCase();
  $("topAvatar").textContent = name.charAt(0).toUpperCase();
  $("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", {weekday:"long", day:"numeric", month:"long", year:"numeric"}).format(new Date());
  refreshAll();
  showPage("dashboard");
}
function friendlyAuthError(error) {
  const codes = {
    "auth/email-already-in-use": "Email ini sudah terdaftar. Silakan masuk.",
    "auth/invalid-email": "Format email belum benar.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/invalid-credential": "Email atau password tidak sesuai.",
    "auth/user-not-found": "Akun tidak ditemukan. Silakan daftar terlebih dahulu.",
    "auth/wrong-password": "Email atau password tidak sesuai.",
    "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
    "auth/network-request-failed": "Koneksi internet bermasalah. Periksa internet kamu."
  };
  return codes[error.code] || `Terjadi kendala: ${error.message || "silakan coba lagi."}`;
}
async function register(event) {
  event.preventDefault();
  const name = $("registerName").value.trim();
  const email = $("registerUsername").value.trim().toLowerCase();
  const password = $("registerPassword").value;
  if (name.length < 2 || !email || password.length < 6) return toast("Isi nama, email yang benar, dan password minimal 6 karakter.");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, {displayName: name});
    $("registerForm").reset();
    toast("Akun berhasil dibuat. Membuka NURSECARE...");
  } catch (error) { toast(friendlyAuthError(error)); }
}
async function login(event) {
  event.preventDefault();
  const email = $("loginUsername").value.trim().toLowerCase();
  const password = $("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    $("loginForm").reset();
    toast("Selamat datang di NURSECARE.");
  } catch (error) { toast(friendlyAuthError(error)); }
}
async function logout() {
  try { await signOut(auth); toast("Anda telah keluar dari NURSECARE."); }
  catch (error) { toast(friendlyAuthError(error)); }
}
function showPage(page) {
  const valid = ["dashboard","patients","assessment","diagnosis","planning","implementation","evaluation","history"];
  if (!valid.includes(page)) return;
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = {dashboard:"Dashboard", patients:"Data Pasien", assessment:"Pengkajian Keperawatan", diagnosis:"Diagnosis SDKI", planning:"Luaran & Intervensi", implementation:"Implementasi Keperawatan", evaluation:"Evaluasi SOAP", history:"Riwayat Dokumentasi"};
  $("pageHeading").textContent = titles[page];
  $("breadcrumb").textContent = `NURSECARE / ${titles[page].toUpperCase()}`;
  $("sidebar").classList.remove("open");
  if (page === "history") renderHistory();
  if (page === "patients") renderPatients();
}
function patients() { return patientData; }
function records() { return recordData; }
function patientName(id) {
  const p = patients().find(x => x.id === id);
  return p ? `${p.name} (${p.mrn})` : "Pasien tidak ditemukan";
}
async function loadSharedData() {
  const [pSnap, rSnap] = await Promise.all([
    getDocs(query(patientsRef, orderBy("createdAt", "desc"))),
    getDocs(query(recordsRef, orderBy("createdAt", "desc")))
  ]);
  patientData = pSnap.docs.map(d => ({id:d.id, ...d.data()}));
  recordData = rSnap.docs.map(d => ({id:d.id, ...d.data()}));
  refreshAll();
}
function refreshPatientSelects() {
  const list = patients();
  document.querySelectorAll(".patient-select").forEach(select => {
    const previous = select.value;
    const isFilter = select.id === "historyPatient";
    select.innerHTML = (isFilter ? '<option value="all">Semua pasien</option>' : '<option value="">Pilih pasien</option>') +
      list.map(p => `<option value="${safe(p.id)}">${safe(p.name)} — ${safe(p.mrn)}</option>`).join("");
    if (list.some(p => p.id === previous) || (isFilter && previous === "all")) select.value = previous;
  });
}
function resetPatientForm() {
  $("patientForm").reset();
  $("patientId").value = "";
  $("patientFormTitle").textContent = "Formulir pasien baru";
}
async function savePatient(event) {
  event.preventDefault();
  const id = $("patientId").value;
  const mrn = $("mrn").value.trim();
  const name = $("patientName").value.trim();
  if (patients().some(p => String(p.mrn).toLowerCase() === mrn.toLowerCase() && p.id !== id)) return toast("Nomor rekam medis sudah digunakan.");
  const item = {mrn, name, age:Number($("patientAge").value), gender:$("patientGender").value, medicalDiagnosis:$("medicalDiagnosis").value.trim(), admissionDate:$("admissionDate").value || today(), updatedAt:new Date().toISOString(), updatedBy:activeUser?.email || ""};
  try {
    if (id) await updateDoc(doc(db, "patients", id), item);
    else await addDoc(patientsRef, {...item, createdAt:new Date().toISOString(), createdBy:activeUser?.email || ""});
    await loadSharedData();
    resetPatientForm();
    toast(id ? "Data pasien berhasil diperbarui." : "Pasien berhasil ditambahkan.");
  } catch (error) { toast(`Gagal menyimpan pasien. ${friendlyAuthError(error)}`); }
}
function editPatient(id) {
  const p = patients().find(x => x.id === id);
  if (!p) return;
  $("patientId").value=p.id; $("mrn").value=p.mrn; $("patientName").value=p.name; $("patientAge").value=p.age;
  $("patientGender").value=p.gender; $("medicalDiagnosis").value=p.medicalDiagnosis || ""; $("admissionDate").value=p.admissionDate || "";
  $("patientFormTitle").textContent="Edit data pasien";
  $("patientEditor").scrollIntoView({behavior:"smooth", block:"start"});
}
async function deletePatient(id) {
  const p = patients().find(x => x.id === id);
  if (!p || !confirm(`Hapus pasien ${p.name} beserta seluruh dokumentasinya? Tindakan ini tidak dapat dibatalkan.`)) return;
  try {
    const related = recordData.filter(r => r.patientId === id);
    await Promise.all(related.map(r => deleteDoc(doc(db, "records", r.id))));
    await deleteDoc(doc(db, "patients", id));
    await loadSharedData();
    toast("Data pasien dan dokumentasinya dihapus.");
  } catch (error) { toast(`Gagal menghapus data. ${friendlyAuthError(error)}`); }
}
function renderPatients() {
  const q = $("patientSearch").value.trim().toLowerCase();
  const list = patients().filter(p => `${p.name} ${p.mrn} ${p.medicalDiagnosis || ""}`.toLowerCase().includes(q));
  $("patientCount").textContent = `${patients().length} pasien`;
  $("patientTable").innerHTML = list.length ? list.map(p => `<tr>
    <td><b>${safe(p.mrn)}</b></td><td>${safe(p.name)}</td><td>${safe(p.age)} tahun</td><td>${safe(p.gender)}</td>
    <td>${safe(p.medicalDiagnosis || "—")}</td><td><div class="table-actions">
    <button class="mini-btn edit-btn" data-edit="${safe(p.id)}">Edit</button>
    <button class="mini-btn delete-btn" data-delete="${safe(p.id)}">Hapus</button></div></td></tr>`).join("") :
    `<tr><td colspan="6"><div class="empty-state">Belum ada data pasien yang sesuai.</div></td></tr>`;
}
async function addRecord(type, patientId, data) {
  if (!patients().some(p => p.id === patientId)) return toast("Tambahkan atau pilih pasien terlebih dahulu.");
  try {
    await addDoc(recordsRef, {type, patientId, data, createdAt:new Date().toISOString(), createdBy:activeUser?.displayName || activeUser?.email || "Pengguna", createdByEmail:activeUser?.email || ""});
    await loadSharedData();
    toast(`${type} berhasil disimpan.`);
  } catch (error) { toast(`Gagal menyimpan dokumentasi. ${friendlyAuthError(error)}`); }
}
function formData(ids) { return Object.fromEntries(ids.map(id => [id, $(id).value.trim()])); }
function bindRecordForm(formId, patientField, type, fields, extra = {}) {
  $(formId).addEventListener("submit", async e => {
    e.preventDefault();
    const patientId = $(patientField).value;
    const data = formData(fields);
    if (extra.transform) Object.assign(data, extra.transform());
    await addRecord(type, patientId, data);
    $(formId).reset();
    if (extra.afterReset) extra.afterReset();
  });
}
function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Tanggal tidak diketahui" : new Intl.DateTimeFormat("id-ID", {dateStyle:"medium", timeStyle:"short"}).format(d);
}
function renderHistory() {
  const patientFilter = $("historyPatient").value || "all";
  const typeFilter = $("historyType").value || "all";
  const list = records().filter(r => (patientFilter === "all" || r.patientId === patientFilter) && (typeFilter === "all" || r.type === typeFilter));
  $("historyList").innerHTML = list.length ? list.map(r => {
    const entries = Object.entries(r.data || {}).filter(([,v]) => v);
    return `<article class="history-card"><div class="history-card-head"><div><h4>${safe(r.type)} · ${safe(patientName(r.patientId))}</h4><small>${safe(formatDate(r.createdAt))} · Oleh ${safe(r.createdBy)}</small></div><span class="recent-type">${safe(r.type)}</span></div>
    <div class="history-body">${entries.map(([k,v]) => `<b>${safe(labelFor(k))}:</b> ${safe(v)}`).join("\n") || "Tidak ada rincian."}</div></article>`;
  }).join("") : `<div class="empty-state">Belum ada dokumentasi untuk filter ini.</div>`;
}
function labelFor(k) {
  const labels = {complaint:"Keluhan utama",history:"Riwayat kesehatan",bp:"Tekanan darah",pulse:"Nadi",temp:"Suhu",resp:"Frekuensi napas",spo2:"SpO₂",pain:"Skala nyeri",nursingDiagnosis:"Diagnosis",diagnosisCode:"Kode SDKI",diagnosisType:"Kategori",ds:"Data subjektif",doData:"Data objektif",cause:"Penyebab",relatedDiagnosis:"Diagnosis terkait",outcome:"Luaran SLKI",criteria:"Kriteria hasil",intervention:"Intervensi SIKI",observation:"Observasi",therapeutic:"Terapeutik",education:"Edukasi",collaboration:"Kolaborasi",action:"Tindakan",actionDate:"Tanggal tindakan",implementer:"Pelaksana",response:"Respons pasien",soapS:"S — Subjective",soapO:"O — Objective",soapA:"A — Assessment",soapP:"P — Planning"};
  return labels[k] || k;
}
function renderDashboard() {
  const p = patients(), r = records();
  $("statPatients").textContent = p.length;
  $("statAssessments").textContent = r.filter(x => x.type === "Pengkajian").length;
  $("statDiagnoses").textContent = r.filter(x => x.type === "Diagnosis SDKI").length;
  $("statEvaluations").textContent = r.filter(x => x.type === "Evaluasi SOAP").length;
  const latest = [...r].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0,5);
  $("recentRecords").innerHTML = latest.length ? latest.map(x => `<div class="recent-item"><div><b>${safe(x.type)}</b><small>${safe(patientName(x.patientId))} · ${safe(formatDate(x.createdAt))}</small></div><span class="recent-type">${safe(x.type)}</span></div>`).join("") : `<div class="empty-state">Belum ada dokumentasi. Mulai dengan menambahkan pasien.</div>`;
}
function refreshAll() { refreshPatientSelects(); renderPatients(); renderDashboard(); if ($("page-history").classList.contains("active")) renderHistory(); }
function init() {
  $("showRegister").addEventListener("click", () => showAuth("register"));
  $("showLogin").addEventListener("click", () => showAuth("login"));
  $("loginForm").addEventListener("submit", login);
  $("registerForm").addEventListener("submit", register);
  $("logoutBtn").addEventListener("click", logout);
  $("patientForm").addEventListener("submit", savePatient);
  $("addPatientBtn").addEventListener("click", () => { resetPatientForm(); $("patientEditor").scrollIntoView({behavior:"smooth"}); });
  $("cancelPatientEdit").addEventListener("click", resetPatientForm);
  $("resetPatient").addEventListener("click", () => setTimeout(() => { $("patientId").value=""; $("patientFormTitle").textContent="Formulir pasien baru"; }, 0));
  $("patientSearch").addEventListener("input", renderPatients);
  $("patientTable").addEventListener("click", e => {
    const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-delete]");
    if (edit) editPatient(edit.dataset.edit);
    if (del) deletePatient(del.dataset.delete);
  });
  bindRecordForm("assessmentForm", "assessmentPatient", "Pengkajian", ["complaint","history","bp","pulse","temp","resp","spo2","pain"]);
  bindRecordForm("diagnosisForm", "diagnosisPatient", "Diagnosis SDKI", ["nursingDiagnosis","diagnosisCode","diagnosisType","ds","doData","cause"]);
  bindRecordForm("planningForm", "planningPatient", "Rencana SLKI/SIKI", ["relatedDiagnosis","outcome","criteria","intervention","observation","therapeutic","education","collaboration"]);
  bindRecordForm("implementationForm", "implementationPatient", "Implementasi", ["action","actionDate","implementer","response"], {afterReset:() => { $("actionDate").value = new Date().toISOString().slice(0,16); }});
  bindRecordForm("evaluationForm", "evaluationPatient", "Evaluasi SOAP", ["soapS","soapO","soapA","soapP"]);
  document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => showPage(b.dataset.page)));
  document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => showPage(b.dataset.go)));
  $("historyPatient").addEventListener("change", renderHistory);
  $("historyType").addEventListener("change", renderHistory);
  $("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  $("actionDate").value = new Date().toISOString().slice(0,16);
  onAuthStateChanged(auth, async user => {
    activeUser = user;
    if (!user) { patientData = []; recordData = []; showAuth("login"); return; }
    enterApp(user);
    try { await loadSharedData(); }
    catch (error) { console.error(error); toast("Belum bisa membaca data bersama. Periksa aturan akses Firestore."); }
  });
}
init();
