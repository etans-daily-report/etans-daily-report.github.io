// State
const state = {
    dates: [],
    selectedDate: null,
    selectedYear: null,
    selectedMonth: null,
    buildingsData: {}, // Map of date -> full json data
    selectedBuildingId: null,
    activeTab: 'dailyreport' // 'dailyreport' | 'eggsummary'
};

// DOM Elements
const els = {
    yearSelect: document.getElementById('year-select'),
    monthSelect: document.getElementById('month-select'),
    dateStrip: document.getElementById('date-strip'),
    buildingList: document.getElementById('building-list'),
    tabDaily: document.getElementById('tab-dailyreport'),
    tabEgg: document.getElementById('tab-eggsummary'),
    dailyDiv: document.getElementById('daily-report-summary'),
    eggDiv: document.getElementById('egg-size-summary')
};

// Initialize application
async function init() {
    setupEventListeners();
    await fetchManifest();
}

function setupEventListeners() {
    els.tabDaily.addEventListener('click', () => setTab('dailyreport'));
    els.tabEgg.addEventListener('click', () => setTab('eggsummary'));

    if (els.yearSelect) {
        els.yearSelect.addEventListener('change', (e) => {
            state.selectedYear = parseInt(e.target.value);
            updateMonthDropdown();
            updateDateStripFromDropdown();
        });
    }
    if (els.monthSelect) {
        els.monthSelect.addEventListener('change', (e) => {
            state.selectedMonth = parseInt(e.target.value);
            updateDateStripFromDropdown();
        });
    }
}

async function fetchManifest() {
    try {
        const res = await fetch('data/manifest.json');
        const manifest = await res.json();
        
        state.dates = manifest.dates || [];
        
        if (state.dates.length > 0) {
            // Sort dates descending (latest first)
            state.dates.sort((a, b) => new Date(b) - new Date(a));
            
            // Default to most recent date
            state.selectedDate = state.dates[0];
            const d = new Date(state.selectedDate + "T00:00:00");
            state.selectedYear = d.getFullYear();
            state.selectedMonth = d.getMonth() + 1;
            
            updateYearDropdown();
            updateMonthDropdown();
            renderDateStrip();
            await loadDateData(state.selectedDate);
        } else {
            renderEmptyState("No dates found in manifest.");
        }
    } catch (err) {
        console.error("Error fetching manifest:", err);
        renderEmptyState("Failed to load dashboard data. Ensure /data/manifest.json exists.");
    }
}

function updateYearDropdown() {
    if (!els.yearSelect) return;
    const years = [...new Set(state.dates.map(dateStr => new Date(dateStr + "T00:00:00").getFullYear()))].sort((a,b) => b - a);
    els.yearSelect.innerHTML = '';
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === state.selectedYear) opt.selected = true;
        els.yearSelect.appendChild(opt);
    });
}

function updateMonthDropdown() {
    if (!els.monthSelect) return;
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const datesInYear = state.dates.filter(dateStr => new Date(dateStr + "T00:00:00").getFullYear() === state.selectedYear);
    const months = [...new Set(datesInYear.map(dateStr => new Date(dateStr + "T00:00:00").getMonth() + 1))].sort((a,b) => b - a);
    
    if (!months.includes(state.selectedMonth)) {
        state.selectedMonth = months.length > 0 ? months[0] : null;
    }
    
    els.monthSelect.innerHTML = '';
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = monthNames[m - 1];
        if (m === state.selectedMonth) opt.selected = true;
        els.monthSelect.appendChild(opt);
    });
}

function updateDateStripFromDropdown() {
    const datesInMonth = state.dates.filter(dateStr => {
        const d = new Date(dateStr + "T00:00:00");
        return d.getFullYear() === state.selectedYear && (d.getMonth() + 1) === state.selectedMonth;
    }).sort((a, b) => new Date(b) - new Date(a));
    
    if (datesInMonth.length > 0 && !datesInMonth.includes(state.selectedDate)) {
        selectDate(datesInMonth[0]);
    } else if (datesInMonth.length === 0) {
        const firstDay = `${state.selectedYear}-${String(state.selectedMonth).padStart(2, '0')}-01`;
        state.selectedDate = firstDay;
        renderDateStrip();
        loadDateData(firstDay);
    } else {
        renderDateStrip();
    }
}

async function loadDateData(dateStr) {
    if (!state.buildingsData[dateStr]) {
        try {
            const res = await fetch(`data/${dateStr}.json`);
            if (!res.ok) throw new Error("File not found");
            const data = await res.json();
            state.buildingsData[dateStr] = data;
        } catch (err) {
            console.error(`Error fetching data for ${dateStr}:`, err);
            state.buildingsData[dateStr] = { date: dateStr, buildings: [], entries: [] };
        }
    }
    
    // Auto-select first building if none selected or if previously selected is not in this date
    const dateData = state.buildingsData[dateStr];
    const buildingExists = dateData.buildings.some(b => b.id === state.selectedBuildingId);
    
    if (!state.selectedBuildingId || !buildingExists) {
        state.selectedBuildingId = dateData.buildings.length > 0 ? dateData.buildings[0].id : null;
    }
    
    renderBuildingList();
    renderContent();
}

function selectDate(dateStr) {
    if (state.selectedDate === dateStr) return;
    state.selectedDate = dateStr;
    renderDateStrip(); // update active state
    loadDateData(dateStr);
}

function selectBuilding(buildingId) {
    if (state.selectedBuildingId === buildingId) return;
    state.selectedBuildingId = buildingId;
    renderBuildingList(); // update active state
    renderContent();
}

function setTab(tab) {
    state.activeTab = tab;
    
    // Update tab UI
    if (tab === 'dailyreport') {
        els.tabDaily.classList.add('active');
        els.tabEgg.classList.remove('active');
        els.dailyDiv.style.display = 'block';
        els.eggDiv.style.display = 'none';
    } else {
        els.tabEgg.classList.add('active');
        els.tabDaily.classList.remove('active');
        els.dailyDiv.style.display = 'none';
        els.eggDiv.style.display = 'block';
    }
    
    renderContent();
}

// Rendering Functions
function renderDateStrip() {
    els.dateStrip.innerHTML = '';
    
    const daysInMonth = new Date(state.selectedYear, state.selectedMonth, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const mm = String(state.selectedMonth).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dateStr = `${state.selectedYear}-${mm}-${dd}`;
        
        const btn = document.createElement('button');
        const hasData = state.dates.includes(dateStr);
        
        let className = 'date-btn';
        if (state.selectedDate === dateStr) className += ' active';
        if (hasData) className += ' has-data';
        
        btn.className = className;
        
        const d = new Date(state.selectedYear, state.selectedMonth - 1, day);
        const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
        
        btn.innerHTML = `<div style="font-size: 0.75rem; line-height: 1; margin-bottom: 4px;">${weekday}</div><div style="font-size: 1.1rem; font-weight: 600; line-height: 1;">${day}</div>`;
        btn.onclick = () => selectDate(dateStr);
        els.dateStrip.appendChild(btn);
    }
}

function renderBuildingList() {
    els.buildingList.innerHTML = '';
    
    const dateData = state.buildingsData[state.selectedDate];
    if (!dateData || !dateData.buildings || dateData.buildings.length === 0) {
        els.buildingList.innerHTML = '<li style="padding: 10px 16px; color: var(--text-muted);">No buildings for this date.</li>';
        return;
    }
    
    dateData.buildings.forEach(b => {
        const li = document.createElement('li');
        li.className = `building-item ${state.selectedBuildingId === b.id ? 'active' : ''}`;
        li.textContent = b.name;
        li.onclick = () => selectBuilding(b.id);
        els.buildingList.appendChild(li);
    });
}

function renderContent() {
    if (!state.selectedDate || !state.selectedBuildingId) {
        els.dailyDiv.innerHTML = '<div class="empty-state">Select a date and building to view data.</div>';
        els.eggDiv.innerHTML = '<div class="empty-state">Select a date and building to view data.</div>';
        return;
    }

    if (state.activeTab === 'dailyreport') {
        renderDailyReport();
    } else {
        renderEggSizeSummary();
    }
}

function renderEmptyState(msg) {
    els.dailyDiv.innerHTML = `<div class="empty-state">${msg}</div>`;
    els.eggDiv.innerHTML = `<div class="empty-state">${msg}</div>`;
}

function renderDailyReport() {
    const data = state.buildingsData[state.selectedDate];
    const building = data.buildings.find(b => b.id === state.selectedBuildingId);
    
    if (!building) return;

    const prod = (data.entries || []).find(e => e.buildingId === building.id && e.type === "production");
    const egg = (data.entries || []).find(e => e.buildingId === building.id && e.type === "egg-summary");
    const mort = (data.entries || []).find(e => e.buildingId === building.id && e.type === "mortality");
    const med = (data.entries || []).find(e => e.buildingId === building.id && e.type === "medication");

    // Format Date
    const dateObj = new Date(state.selectedDate + "T00:00:00");
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const dayName = dayNames[dateObj.getDay()];

    let html = `FARM DAILY REPORT\n${yyyy} ${mm} ${dd} ${dayName}\nREPORT BY: ${prod?.reporter || ""}\nEGG SORTER: ${prod?.eggSorter || egg?.eggSorter || ""}\n\nBLDG: ${building.name}\nBREED: ${building.breed}\nFLOCKMAN: ${building.flockman}\nAGE: ${building.ageWeeks}w${building.ageDays}d\nHD: ${(prod?.currentHeads ?? building.startingHeads).toLocaleString()}\nM: ${prod?.mortalityCount ?? 0}\nC: ${prod?.culls ?? 0}\n\nPROD: ${prod?.production?.cases ?? 0}C\nPCS: ${prod?.production?.totalPieces ?? 0}\n%: ${prod && prod.currentHeads ? (((prod.production?.totalPieces ?? 0) / prod.currentHeads) * 100).toFixed(2) : "0.00"}%\nBGS: ${prod?.feed?.bags ?? 0}  |  FEED: ${prod?.feed?.brand || "(not specified)"}\nG: ${prod?.feed?.gramsPerBirdDay ?? 0}g\n\nMEDICATIONS:\n${med ? (med.medication && med.medication.length ? med.medication.map((rx) => `- ${rx.drug || ""} ${rx.dosage || ""} ${rx.route || ""} x${rx.qty ?? ""}${rx.notes ? " (" + rx.notes + ")" : ""}`).join("\n") : "(none)") : "(none)"}\n\nEGG SIZE SUMMARY\nSIZE      \tPCS\t%\n`;
    
    // Only these sizes
    const SIZES = [
        ["nnv", "NNV"],
        ["nv", "NV"],
        ["no_weight", "NO WEIGHT"],
        ["pullet", "PULLET"],
        ["pewee", "PEEWEE"],
        ["small", "SMALL"],
        ["medium", "MEDIUM"],
        ["larger", "LARGER"],
        ["xlarge", "X-LARGE"],
        ["jumbo", "JUMBO"],
        ["s_jumbo", "S-JUMBO"],
        ["broken", "BROKEN"],
        ["bold", "BOLD"],
        ["loss", "LOSS"],
    ];

    let eggTotal = 0;
    if (egg && egg.distribution) {
        for (const [k] of SIZES) eggTotal += egg.distribution[k]?.pieces || 0;
    }
    for (const [k, label] of SIZES) {
        const pcs = egg?.distribution?.[k]?.pieces || "";
        const pct = eggTotal > 0 && pcs ? ((pcs / eggTotal) * 100).toFixed(2) + "%" : "";
        html += `${label.padEnd(10)}\t${pcs}\t${pct}\n`;
    }
    html += `TOTAL     \t${eggTotal}\t${eggTotal > 0 ? "100%" : ""}\n\n`;

    // Mortality
    html += `TOTAL MORTALITIES: ${mort?.totalMortality ?? prod?.mortalityCount ?? 0}\n`;
    if (mort && mort.mortality && mort.mortality.length) {
        for (const mr of mort.mortality) {
            html += `- ${mr.cause || "Unknown"}: ${mr.count ?? 0}${mr.notes ? " (" + mr.notes + ")" : ""}\n`;
        }
    } else {
        html += "(none)\n";
    }

    // Notes
    let notes = [prod?.notes, mort?.notes, med?.notes].filter(Boolean).join("\n");
    html += `\nHAPPENINGS / NOTES:\n${notes || "(none)"}\n\n`;

    // Weather
    html += `WEATHER:\nAM:        ${prod?.weatherAm || ""}\nPM:        ${prod?.weatherPm || ""}\nTEMP:      ${prod?.temperature || ""}`;

    els.dailyDiv.innerHTML = `<div class="report-container">${html}</div>`;
}

function renderEggSizeSummary() {
    const data = state.buildingsData[state.selectedDate];
    const building = data.buildings.find(b => b.id === state.selectedBuildingId);
    
    if (!building) return;

    const egg = (data.entries || []).find(e => e.buildingId === building.id && e.type === "egg-summary");
    
    const SIZES = [
        ["nnv", "NNV"],
        ["nv", "NV"],
        ["no_weight", "NO WEIGHT"],
        ["pullet", "PULLET"],
        ["pewee", "PEEWEE"],
        ["small", "SMALL"],
        ["medium", "MEDIUM"],
        ["larger", "LARGER"],
        ["xlarge", "X-LARGE"],
        ["jumbo", "JUMBO"],
        ["s_jumbo", "S-JUMBO"],
        ["broken", "BROKEN"],
        ["bold", "BOLD"],
        ["loss", "LOSS"]
    ];

    let html = `
        <table class="egg-table">
            <thead>
                <tr>
                    <th>Egg Size</th>
                    <th>Cases</th>
                    <th>Trays</th>
                    <th>Pieces</th>
                </tr>
            </thead>
            <tbody>
    `;

    let totalCases = 0, totalTrays = 0, totalPieces = 0;
    
    if (egg && egg.distribution) {
        for (const [k, label] of SIZES) {
            const dist = egg.distribution[k] || {};
            const cases = dist.cases || 0;
            const trays = dist.trays || 0;
            const pieces = dist.pieces || 0;
            
            totalCases += cases;
            totalTrays += trays;
            totalPieces += pieces;
            
            html += `
                <tr>
                    <td>${label}</td>
                    <td>${cases || "-"}</td>
                    <td>${trays || "-"}</td>
                    <td>${pieces || "-"}</td>
                </tr>
            `;
        }
    } else {
        for (const [k, label] of SIZES) {
            html += `<tr><td>${label}</td><td>-</td><td>-</td><td>-</td></tr>`;
        }
    }

    html += `
            <tr class="total-row">
                <td>TOTAL</td>
                <td>${totalCases}</td>
                <td>${totalTrays}</td>
                <td>${totalPieces}</td>
            </tr>
        </tbody>
    </table>`;

    els.eggDiv.innerHTML = html;
}

// Boot up
document.addEventListener("DOMContentLoaded", init);
