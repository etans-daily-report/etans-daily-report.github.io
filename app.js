const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;

const app = createApp({
    setup() {
        // State
        const dates = ref([]);
        const selectedDate = ref(null);
        const selectedYear = ref(null);
        const selectedMonth = ref(null);
        const buildingsData = ref({});
        const selectedBuildingId = ref(null);
        const activeTab = ref('dailyreport');
        
        // DOM Refs for scrolling
        const activeDateBtn = ref(null);

        // Fetch manifest on load
        onMounted(async () => {
            try {
                const res = await fetch('data/manifest.json');
                const manifest = await res.json();
                
                dates.value = manifest.dates || [];
                
                if (dates.value.length > 0) {
                    dates.value.sort((a, b) => new Date(b) - new Date(a));
                    
                    const firstDate = dates.value[0];
                    const d = new Date(firstDate + "T00:00:00");
                    selectedYear.value = d.getFullYear();
                    selectedMonth.value = d.getMonth() + 1;
                    
                    await selectDate(firstDate);
                }
            } catch (err) {
                console.error("Error fetching manifest:", err);
            }
        });

        // Dropdown computed properties
        const availableYears = computed(() => {
            return [...new Set(dates.value.map(d => new Date(d + "T00:00:00").getFullYear()))].sort((a, b) => b - a);
        });

        const availableMonths = computed(() => {
            if (!selectedYear.value) return [];
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const datesInYear = dates.value.filter(d => new Date(d + "T00:00:00").getFullYear() === selectedYear.value);
            const months = [...new Set(datesInYear.map(d => new Date(d + "T00:00:00").getMonth() + 1))].sort((a, b) => b - a);
            return months.map(m => ({ val: m, name: monthNames[m - 1] }));
        });

        // Watchers for dropdowns to update date strip
        watch(selectedYear, (newYear) => {
            const months = availableMonths.value;
            if (months.length > 0 && !months.find(m => m.val === selectedMonth.value)) {
                selectedMonth.value = months[0].val;
            }
            updateDateFromDropdowns();
        });

        watch(selectedMonth, () => {
            updateDateFromDropdowns();
        });

        function updateDateFromDropdowns() {
            if (!selectedYear.value || !selectedMonth.value) return;
            const datesInMonth = dates.value.filter(dateStr => {
                const d = new Date(dateStr + "T00:00:00");
                return d.getFullYear() === selectedYear.value && (d.getMonth() + 1) === selectedMonth.value;
            }).sort((a, b) => new Date(b) - new Date(a));
            
            if (datesInMonth.length > 0 && !datesInMonth.includes(selectedDate.value)) {
                selectDate(datesInMonth[0]);
            } else if (datesInMonth.length === 0) {
                const firstDay = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-01`;
                selectDate(firstDay);
            }
        }

        // Date Strip computed
        const daysInMonthList = computed(() => {
            if (!selectedYear.value || !selectedMonth.value) return [];
            const list = [];
            const daysInMonth = new Date(selectedYear.value, selectedMonth.value, 0).getDate();
            
            for (let day = 1; day <= daysInMonth; day++) {
                const mm = String(selectedMonth.value).padStart(2, '0');
                const dd = String(day).padStart(2, '0');
                const dateStr = `${selectedYear.value}-${mm}-${dd}`;
                
                const d = new Date(selectedYear.value, selectedMonth.value - 1, day);
                const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
                
                list.push({
                    dateStr,
                    weekday,
                    dayNum: day,
                    hasData: dates.value.includes(dateStr)
                });
            }
            return list;
        });

        // Scroll active date
        watch(selectedDate, async () => {
            await nextTick();
            if (activeDateBtn.value) {
                activeDateBtn.value.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        });

        // Data fetching
        async function loadDateData(dateStr) {
            if (!buildingsData.value[dateStr]) {
                try {
                    const res = await fetch(`data/${dateStr}.json`);
                    if (!res.ok) throw new Error("File not found");
                    const data = await res.json();
                    buildingsData.value[dateStr] = data;
                } catch (err) {
                    buildingsData.value[dateStr] = { date: dateStr, buildings: [], entries: [] };
                }
            }
        }

        async function selectDate(dateStr) {
            if (selectedDate.value === dateStr && buildingsData.value[dateStr]) return;
            selectedDate.value = dateStr;
            await loadDateData(dateStr);
            
            // Auto-select building
            const dateData = buildingsData.value[dateStr];
            const buildingExists = dateData.buildings.some(b => b.id === selectedBuildingId.value);
            if (!selectedBuildingId.value || !buildingExists) {
                selectedBuildingId.value = dateData.buildings.length > 0 ? dateData.buildings[0].id : null;
            }
        }

        function selectBuilding(id) {
            selectedBuildingId.value = id;
        }

        function formatAge(weeks, days) {
            if (weeks === undefined && days === undefined) return "Unknown age";
            return `${weeks || 0}w ${days || 0}d`;
        }

        // Computed data for UI
        const dashboardMetrics = computed(() => {
            if (!selectedDate.value || !buildingsData.value[selectedDate.value]) {
                return { population: 0, productionPercent: 0, activeBuildings: 0 };
            }
            
            const data = buildingsData.value[selectedDate.value];
            const buildings = data.buildings || [];
            const entries = data.entries || [];
            
            let totalPop = 0;
            let totalEggs = 0;
            
            buildings.forEach(bldg => {
                const prod = entries.find(e => e.buildingId === bldg.id && e.type === 'production');
                totalPop += prod?.currentHeads ?? bldg.startingHeads ?? 0;
                totalEggs += prod?.production?.totalPieces ?? 0;
            });
            
            const prodPercent = totalPop > 0 ? ((totalEggs / totalPop) * 100).toFixed(1) : 0;
            
            return {
                population: totalPop.toLocaleString(),
                productionPercent: prodPercent,
                activeBuildings: buildings.length
            };
        });

        const currentBuildings = computed(() => {
            if (!selectedDate.value || !buildingsData.value[selectedDate.value]) return [];
            return buildingsData.value[selectedDate.value].buildings || [];
        });

        const currentBuilding = computed(() => {
            return currentBuildings.value.find(b => b.id === selectedBuildingId.value);
        });

        const currentEntries = computed(() => {
            if (!selectedDate.value || !buildingsData.value[selectedDate.value]) return [];
            return buildingsData.value[selectedDate.value].entries || [];
        });

        const currentProd = computed(() => currentEntries.value.find(e => e.buildingId === selectedBuildingId.value && e.type === "production"));
        const currentEgg = computed(() => currentEntries.value.find(e => e.buildingId === selectedBuildingId.value && e.type === "egg-summary"));
        const currentMort = computed(() => currentEntries.value.find(e => e.buildingId === selectedBuildingId.value && e.type === "mortality"));
        const currentMed = computed(() => currentEntries.value.find(e => e.buildingId === selectedBuildingId.value && e.type === "water-medication"));

        // Egg Summary Formatting
        const EGG_SIZES = [
            ["nnv", "NNV"], ["nv", "NV"], ["no_weight", "NO WEIGHT"], ["pullet", "PULLET"],
            ["pewee", "PEEWEE"], ["small", "SMALL"], ["medium", "MEDIUM"], ["larger", "LARGER"],
            ["xlarge", "X-LARGE"], ["jumbo", "JUMBO"], ["s_jumbo", "S-JUMBO"], ["broken", "BROKEN"],
            ["bold", "BOLD"], ["loss", "LOSS"]
        ];

        const eggSummaryRows = computed(() => {
            return EGG_SIZES.map(([key, label]) => {
                const dist = currentEgg.value?.distribution?.[key] || {};
                return {
                    key,
                    label,
                    total: dist.total ?? dist.totalPieces ?? dist.total_pieces ?? "-",
                    percentage: dist.percentage ?? dist.percent ?? dist['%'] ?? "-",
                    cases: dist.cases || "-",
                    trays: dist.trays || "-",
                    pieces: dist.pieces || "-"
                };
            });
        });

        const eggTotals = computed(() => {
            return eggSummaryRows.value.reduce((acc, row) => {
                acc.total += (typeof row.total === 'number') ? row.total : 0;
                acc.percentage += (typeof row.percentage === 'number') ? row.percentage : 0;
                acc.cases += (row.cases !== "-") ? row.cases : 0;
                acc.trays += (row.trays !== "-") ? row.trays : 0;
                acc.pieces += (row.pieces !== "-") ? row.pieces : 0;
                return acc;
            }, { total: 0, percentage: 0, cases: 0, trays: 0, pieces: 0 });
        });

        // Daily Report Formatting
        const dailyReportText = computed(() => {
            if (!currentBuilding.value) return "";
            
            const b = currentBuilding.value;
            const prod = currentProd.value;
            const mort = currentMort.value;
            const med = currentMed.value;
            
            // Format Date
            const d = new Date(selectedDate.value + "T00:00:00");
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
            
            const heads = prod?.currentHeads ?? b.startingHeads ?? 0;
            const pieces = prod?.production?.totalPieces ?? 0;
            const prodCases = prod?.production?.cases ?? 0;
            const prodPercent = heads > 0 ? ((pieces / heads) * 100).toFixed(2) : "0.00";
            const mortalityCount = mort?.totalMortality ?? prod?.mortalityCount ?? 0;
            
            let txt = `FARM DAILY REPORT\n${yyyy} ${mm} ${dd} ${weekday}\n`;
            txt += `REPORT BY: ${prod?.reporter || "Admin"}\n`;
            txt += `EGG SORTER: ${prod?.eggSorter || ""}\n\n`;
            
            txt += `BLDG: ${b.name}\n`;
            txt += `BREED: ${b.breed || ""}\n`;
            txt += `FLOCKMAN: ${b.flockman || ""}\n`;
            txt += `AGE: ${formatAge(prod?.ageWeeks, prod?.ageDays)}\n`;
            txt += `HD: ${heads.toLocaleString()}\n`;
            txt += `M: ${mortalityCount}\n`;
            txt += `C: ${prod?.culls ?? 0}\n\n`;
            
            txt += `PROD: ${prodCases}C\n`;
            txt += `PCS: ${pieces}\n`;
            txt += `%: ${prodPercent}%\n`;
            txt += `BGS: ${prod?.feed?.bags ?? 0}  |  FEED: ${prod?.feed?.brand || ""}\n`;
            txt += `G: ${(prod?.feed?.gramsPerBirdDay ?? 0).toFixed(2)}g\n\n`;
            
            txt += `MEDICATIONS:\n`;
            txt += `${med?.medication || "(none)"}\n\n`;
            
            txt += `EGG SIZE SUMMARY\n`;
            txt += `SIZE      \tPCS\t%\n`;
            
            eggSummaryRows.value.forEach(row => {
                const pcsStr = (row.pieces !== "-") ? row.pieces : "";
                const pctStr = (row.percentage !== "-") ? row.percentage : "";
                txt += `${row.label.padEnd(10)}\t${pcsStr}\t${pctStr}\n`;
            });
            const totPcsStr = eggTotals.value.pieces || "";
            const totPctStr = eggTotals.value.percentage ? eggTotals.value.percentage.toFixed(1) : "";
            txt += `TOTAL     \t${totPcsStr}\t${totPctStr}\n\n`;
            
            txt += `TOTAL MORTALITIES: ${mortalityCount}\n`;
            if (mort?.mortality?.length) {
                mort.mortality.forEach(mr => {
                    txt += `${mr.cause || "Unknown"}: ${mr.count ?? 0}${mr.notes ? " (" + mr.notes + ")" : ""}\n`;
                });
            } else {
                txt += `(none)\n`;
            }
            txt += `\n`;
            
            const notes = [prod?.notes, mort?.notes, med?.notes].filter(Boolean).join("\n");
            txt += `HAPPENINGS / NOTES:\n`;
            txt += `${notes || "(none)"}\n\n`;
            
            txt += `WEATHER:\n`;
            txt += `AM:        ${prod?.weatherAm || ""}\n`;
            txt += `PM:        ${prod?.weatherPm || ""}\n`;
            txt += `TEMP:      ${prod?.temperature || ""}`;
            
            return txt;
        });

        // Necropsy Report Formatting
        const necropsyReportText = computed(() => {
            if (!currentBuilding.value) return "";
            
            const b = currentBuilding.value;
            const mort = currentMort.value;
            const prod = currentProd.value;
            
            let txt = `NECROPSY & MORTALITY REPORT\n${selectedDate.value}\n\n`;
            txt += `BLDG: ${b.name}\n\n`;
            txt += `TOTAL MORTALITIES: ${mort?.totalMortality ?? prod?.mortalityCount ?? 0}\n\n`;
            
            if (mort?.mortality?.length) {
                txt += `CAUSES:\n`;
                mort.mortality.forEach(mr => {
                    txt += `- ${mr.cause || "Unknown"}: ${mr.count ?? 0}${mr.notes ? " (" + mr.notes + ")" : ""}\n`;
                });
                txt += `\n`;
            } else {
                txt += `CAUSES:\n(none specified)\n\n`;
            }
            
            txt += `NOTES / FINDINGS:\n`;
            txt += mort?.notes || "(No specific necropsy notes for this date)";
            
            return txt;
        });

        return {
            selectedYear, selectedMonth, selectedDate, selectedBuildingId, activeTab,
            availableYears, availableMonths, daysInMonthList,
            currentBuildings, currentBuilding, dashboardMetrics,
            selectDate, selectBuilding, formatAge,
            activeDateBtn,
            dailyReportText,
            eggSummaryRows, eggTotals,
            necropsyReportText
        };
    }
});

app.mount('#app');
