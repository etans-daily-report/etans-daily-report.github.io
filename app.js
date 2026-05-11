const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;

const app = createApp({
  setup() {
    // State
    const appConfig = ref(null);   // Loaded from manifest.json meta block
    const dates = ref([]);
    const selectedDate = ref(null);
    const selectedYear = ref(null);
    const selectedMonth = ref(null);
    const buildingsData = ref({});
    const selectedBuildingId = ref("ALL");
    const activeTab = ref("dailyreport");
    const activeSubTab = ref("weekly");
    const activeOverviewSubTab = ref("cards");
    const isFullScreenTable = ref(false);
    const isFullScreenReport = ref(false);

    const tableFontSize = ref(14); // Default 14px

    const isLoggedIn = ref(localStorage.getItem("isLoggedIn") === "true");
    const passwordInput = ref("");
    const loginError = ref(false);
    const showPassword = ref(false);

    const checkLogin = () => {
      const correctPassword = appConfig.value?.password || "ETANS@FARM";
      if (passwordInput.value === correctPassword) {
        isLoggedIn.value = true;
        loginError.value = false;
        localStorage.setItem("isLoggedIn", "true");
      } else {
        loginError.value = true;
      }
    };

    const logout = () => {
      isLoggedIn.value = false;
      localStorage.removeItem("isLoggedIn");
      passwordInput.value = "";
    };


    // DOM Refs for scrolling
    const activeDateBtn = ref(null);

    // Fetch manifest on load
    onMounted(async () => {
      try {
        const res = await fetch("data/manifest.json");
        const manifest = await res.json();

        // Load meta/config from manifest — single source of truth
        if (manifest.meta) {
          appConfig.value = manifest.meta;
          // Push config into KPIFramework so it uses JSON-driven constants
          if (window.KPIFramework && manifest.meta.kpi) {
            window.KPIFramework.config = manifest.meta.kpi;
          }
        }

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
        console.error("Error during startup:", err);
      } finally {
        // GUARANTEE the loading screen disappears
        const loader = document.getElementById("loading-overlay");
        if (loader) {
          loader.style.transition = "opacity 0.5s ease";
          loader.style.opacity = "0";
          setTimeout(() => {
            loader.style.display = "none";
          }, 500);
        }
      }
    });

    // Dropdown computed properties
    const availableYears = computed(() => {
      return [
        ...new Set(
          dates.value.map((d) => new Date(d + "T00:00:00").getFullYear()),
        ),
      ].sort((a, b) => b - a);
    });

    const availableMonths = computed(() => {
      if (!selectedYear.value) return [];
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const datesInYear = dates.value.filter(
        (d) => new Date(d + "T00:00:00").getFullYear() === selectedYear.value,
      );
      const months = [
        ...new Set(
          datesInYear.map((d) => new Date(d + "T00:00:00").getMonth() + 1),
        ),
      ].sort((a, b) => b - a);
      return months.map((m) => ({ val: m, name: monthNames[m - 1] }));
    });

    // Watchers for dropdowns to update date strip
    watch(selectedYear, (newYear) => {
      const months = availableMonths.value;
      if (
        months.length > 0 &&
        !months.find((m) => m.val === selectedMonth.value)
      ) {
        selectedMonth.value = months[0].val;
      }
      updateDateFromDropdowns();
    });

    watch(selectedMonth, () => {
      updateDateFromDropdowns();
    });


    function updateDateFromDropdowns() {
      if (!selectedYear.value || !selectedMonth.value) return;
      const datesInMonth = dates.value
        .filter((dateStr) => {
          const d = new Date(dateStr + "T00:00:00");
          return (
            d.getFullYear() === selectedYear.value &&
            d.getMonth() + 1 === selectedMonth.value
          );
        })
        .sort((a, b) => new Date(b) - new Date(a));

      if (
        datesInMonth.length > 0 &&
        !datesInMonth.includes(selectedDate.value)
      ) {
        selectDate(datesInMonth[0]);
      } else if (datesInMonth.length === 0) {
        const firstDay = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, "0")}-01`;
        selectDate(firstDay);
      }
    }

    // Date Strip computed
    const daysInMonthList = computed(() => {
      if (!selectedYear.value || !selectedMonth.value) return [];
      const list = [];
      const daysInMonth = new Date(
        selectedYear.value,
        selectedMonth.value,
        0,
      ).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const mm = String(selectedMonth.value).padStart(2, "0");
        const dd = String(day).padStart(2, "0");
        const dateStr = `${selectedYear.value}-${mm}-${dd}`;

        const d = new Date(selectedYear.value, selectedMonth.value - 1, day);
        const weekday = d.toLocaleDateString(undefined, { weekday: "short" });

        list.push({
          dateStr,
          weekday,
          dayNum: day,
          hasData: dates.value.includes(dateStr),
        });
      }
      return list;
    });

    // Scroll active date
    watch(selectedDate, async () => {
      await nextTick();
      if (activeDateBtn.value) {
        activeDateBtn.value.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
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
          buildingsData.value[dateStr] = {
            date: dateStr,
            buildings: [],
            entries: [],
          };
        }
      }
    }

    async function selectDate(dateStr) {
      if (selectedDate.value === dateStr && buildingsData.value[dateStr])
        return;
      selectedDate.value = dateStr;
      await loadDateData(dateStr);

      // Auto-select building
      const dateData = buildingsData.value[dateStr];
      if (selectedBuildingId.value !== "ALL") {
        const buildingExists = dateData.buildings.some(
          (b) => b.id === selectedBuildingId.value,
        );
        if (!selectedBuildingId.value || !buildingExists) {
          selectedBuildingId.value = "ALL";
        }
      }
    }

    function selectBuilding(id) {
      selectedBuildingId.value = id;
    }





    function getProdClass(pct) {
      if (pct >= 85) return "prod-excellent";
      if (pct >= 75) return "prod-good";
      if (pct >= 60) return "prod-warning";
      return "prod-danger";
    }

    function getPerformanceLabel(pct) {
      if (pct >= 90) return "EXCELLENT";
      if (pct >= 80) return "GREAT";
      if (pct >= 70) return "GOOD";
      if (pct >= 50) return "AVERAGE";
      return "WARNING";
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

      buildings.forEach((bldg) => {
        const prod = entries.find(
          (e) => e.buildingId === bldg.id && e.type === "production",
        );
        totalPop += prod?.currentHeads ?? bldg.startingHeads ?? 0;
        totalEggs += prod?.production?.totalPieces ?? 0;
      });

      const prodPercent =
        totalPop > 0 ? ((totalEggs / totalPop) * 100).toFixed(1) : 0;

      return {
        population: totalPop.toLocaleString(),
        productionPercent: prodPercent,
        activeBuildings: buildings.length,
      };
    });

    const currentBuildings = computed(() => {
      const data = buildingsData.value[selectedDate.value];
      if (!data || !data.buildings) return [];
      return [...data.buildings].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );
    });

    const currentBuilding = computed(() => {
      return currentBuildings.value.find(
        (b) => b.id === selectedBuildingId.value,
      );
    });

    const currentEntries = computed(() => {
      if (!selectedDate.value || !buildingsData.value[selectedDate.value])
        return [];
      return buildingsData.value[selectedDate.value].entries || [];
    });



    // View All Buildings Data
    const sortedAllBuildings = computed(() => {
      const buildings = currentBuildings.value;
      const entries = currentEntries.value;

      const mapped = buildings.map((b) => {
        const prod = entries.find(
          (e) => e.buildingId === b.id && e.type === "production",
        );
        const mort = entries.find(
          (e) => e.buildingId === b.id && e.type === "mortality",
        );

        // --- All fields sourced from production entry (same as Daily Report) ---
        const heads       = prod?.currentHeads     ?? b.startingHeads ?? 0;
        const pieces      = prod?.production?.totalPieces ?? 0;
        const prodCases   = prod?.production?.cases ?? 0;
        const percent     = heads > 0 ? ((pieces / heads) * 100).toFixed(2) : "0.00";

        // Age: use the entry's reported age, not the building's static metadata
        const ageWeeks    = prod?.ageWeeks  ?? b.ageWeeks  ?? 0;
        const ageDays     = prod?.ageDays   ?? b.ageDays   ?? 0;

        // Mortality: prefer dedicated mortality entry, fall back to production entry field
        const mortalityCount = mort?.totalMortality ?? prod?.mortalityCount ?? 0;
        const culls          = prod?.culls ?? 0;

        // Feed
        const feedBags    = prod?.feed?.bags ?? 0;
        const feedBrand   = prod?.feed?.brand ?? "";
        const gPerBird    = prod?.feed?.gramsPerBirdDay ?? 0;

        // Weather / notes
        const weatherAm   = prod?.weatherAm   ?? "";
        const weatherPm   = prod?.weatherPm   ?? "";
        const temperature = prod?.temperature ?? "";
        const notes       = prod?.notes ?? "";

        return {
          ...b,                           // id, name, breed, startDate, culledAt
          flockman: b.flockman || "None",
          startingHeads: b.startingHeads ?? 0,
          // --- entry-driven fields ---
          currentHeads:  heads,
          ageWeeks,
          ageDays,
          totalDays:     ageWeeks * 7 + ageDays,
          eggPercent:    percent,
          totalPieces:   pieces,
          prodCases,
          mortalityCount,
          culls,
          feedBags,
          feedBrand,
          gPerBird,
          weatherAm,
          weatherPm,
          temperature,
          notes,
        };
      });

      return mapped.sort((a, b) => a.name.localeCompare(b.name));
    });


    const currentProd = computed(() =>
      currentEntries.value.find(
        (e) =>
          e.buildingId === selectedBuildingId.value && e.type === "production",
      ),
    );
    const currentEgg = computed(() =>
      currentEntries.value.find(
        (e) =>
          e.buildingId === selectedBuildingId.value && e.type === "egg-summary",
      ),
    );
    const currentMort = computed(() =>
      currentEntries.value.find(
        (e) =>
          e.buildingId === selectedBuildingId.value && e.type === "mortality",
      ),
    );
    const currentMed = computed(() =>
      currentEntries.value.find(
        (e) =>
          e.buildingId === selectedBuildingId.value &&
          e.type === "water-medication",
      ),
    );

    // ── WEEKLY SUMMARY TABLE ──────────────────────────────────────────────────

    // Pre-fetch all available dates so history is ready
    watch(dates, async (newDates) => {
      if (!newDates) return;
      for (const dateStr of newDates) {
        await loadDateData(dateStr);
      }
    }, { immediate: true });

    const dailyCurrentPage = ref(1);
    const weeklyCurrentPage = ref(1);
    const monthlyCurrentPage = ref(1);
    const entriesPerPage = ref(10);
    const dailyMonthFilter = ref('');
    const dailySearchQuery = ref('');

    // Group available data by day for all buildings combined
    const dailyHistoryTable = computed(() => {
      const history = {};
      
      Object.keys(buildingsData.value).forEach(dateStr => {
        const dayData = buildingsData.value[dateStr];
        if (!dayData || !dayData.entries) return;
        
        const prods = dayData.entries.filter((e) => e.type === "production");
        if (prods.length === 0) return;
        
        let totalPop = 0;
        let totalBags = 0;
        let totalEggs = 0;
        let totalMort = 0;
        let totalCulls = 0;
        let totalGrams = 0;
        
        prods.forEach(prod => {
          const mort = dayData.entries.find(
            (e) => e.type === "mortality" && e.buildingId === prod.buildingId
          );
          
          const heads = prod.currentHeads || 0;
          totalPop += heads;
          totalBags += prod.feed?.bags || 0;
          totalEggs += prod.production?.totalPieces || 0;
          totalMort += mort?.totalMortality ?? prod.mortalityCount ?? 0;
          totalCulls += prod.culls || 0;
          totalGrams += (prod.feed?.gramsPerBirdDay || 0) * heads;
        });
        
        const avgFeed = totalPop > 0 ? (totalGrams / totalPop).toFixed(1) : "0.0";
        const avgProd = totalPop > 0 ? ((totalEggs / totalPop) * 100).toFixed(2) : "0.00";
        
        const d = new Date(dateStr + "T00:00:00");
        const dateLabel = d.toLocaleDateString("en-US", { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        
        history[dateStr] = {
          date: dateStr,
          dateLabel,
          heads: totalPop,
          bags: totalBags,
          avgFeed,
          totalEggs,
          avgProd,
          mortality: totalMort,
          culls: totalCulls
        };
      });
      
      return Object.values(history).sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    // Available months for filtering in Daily view
    const availableMonthsInDaily = computed(() => {
      const months = new Set();
      dailyHistoryTable.value.forEach(d => {
        months.add(d.date.slice(0, 7)); // "YYYY-MM"
      });
      return Array.from(months).sort().reverse();
    });

    // Filtered Daily History
    const filteredDailyHistory = computed(() => {
      return dailyHistoryTable.value.filter(d => {
        const matchesMonth = !dailyMonthFilter.value || d.date.startsWith(dailyMonthFilter.value);
        const matchesSearch = !dailySearchQuery.value || d.date.includes(dailySearchQuery.value) || d.dateLabel.toLowerCase().includes(dailySearchQuery.value.toLowerCase());
        return matchesMonth && matchesSearch;
      });
    });

    // Group available data by week for all buildings combined
    const weeklyHistoryTable = computed(() => {
      const history = {}; // { key: { ... } }
      
      Object.keys(buildingsData.value).forEach(dateStr => {
        const dayData = buildingsData.value[dateStr];
        if (!dayData || !dayData.entries) return;
        
        const prods = dayData.entries.filter((e) => e.type === "production");
        if (prods.length === 0) return;
        
        // Calculate calendar week (using Monday as start of week)
        const d = new Date(dateStr + "T00:00:00");
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const weekKey = monday.toISOString().slice(0, 10); // "2026-05-11"
        
        if (!history[weekKey]) {
          history[weekKey] = {
            weekKey,
            days: 0,
            bags: 0,
            pieces: 0,
            mortality: 0,
            culls: 0,
            totalGramsSum: 0,
            totalPopSum: 0,
            headsPerDate: {} // { date: totalHeads }
          };
        }
        
        let dayPop = 0;
        let dayGrams = 0;
        
        prods.forEach(prod => {
          const mort = dayData.entries.find(
            (e) => e.type === "mortality" && e.buildingId === prod.buildingId
          );
          
          const heads = prod.currentHeads || 0;
          dayPop += heads;
          history[weekKey].bags += prod.feed?.bags || 0;
          history[weekKey].pieces += prod.production?.totalPieces || 0;
          history[weekKey].mortality += mort?.totalMortality ?? prod.mortalityCount ?? 0;
          history[weekKey].culls += prod.culls || 0;
          dayGrams += (prod.feed?.gramsPerBirdDay || 0) * heads;
        });
        
        history[weekKey].days += 1;
        history[weekKey].totalGramsSum += dayGrams;
        history[weekKey].totalPopSum += dayPop;
        
        if (!history[weekKey].headsPerDate[dateStr]) {
          history[weekKey].headsPerDate[dateStr] = 0;
        }
        history[weekKey].headsPerDate[dateStr] += dayPop;
      });
      
      return Object.values(history).map(wk => {
        const avgFeed = wk.totalPopSum > 0 ? (wk.totalGramsSum / wk.totalPopSum).toFixed(1) : "0.0";
        const avgProd = wk.totalPopSum > 0 ? ((wk.pieces / wk.totalPopSum) * 100).toFixed(2) : "0.00";
        
        const datesInWeek = Object.keys(wk.headsPerDate).sort();
        const latestDate = datesInWeek[datesInWeek.length - 1];
        const latestHeads = wk.headsPerDate[latestDate] || 0;
        
        const d = new Date(wk.weekKey + "T00:00:00");
        const weekLabel = `Week of ${d.toLocaleDateString("en-US", { month: 'short', day: 'numeric' })}`;
        
        return {
          weekKey: wk.weekKey,
          weekLabel,
          heads: latestHeads,
          bags: wk.bags,
          avgFeed,
          totalEggs: wk.pieces,
          avgProd,
          mortality: wk.mortality,
          culls: wk.culls
        };
      }).sort((a, b) => b.weekKey.localeCompare(a.weekKey));
    });

    // Group available data by month for all buildings combined
    const monthlyHistoryTable = computed(() => {
      const history = {}; // { key: { ... } }
      
      Object.keys(buildingsData.value).forEach(dateStr => {
        const dayData = buildingsData.value[dateStr];
        if (!dayData || !dayData.entries) return;
        
        const yearMonth = dateStr.slice(0, 7); // "2026-05"
        
        const prods = dayData.entries.filter((e) => e.type === "production");
        if (prods.length === 0) return;
        
        if (!history[yearMonth]) {
          history[yearMonth] = {
            month: yearMonth,
            days: 0,
            bags: 0,
            pieces: 0,
            mortality: 0,
            culls: 0,
            totalGramsSum: 0,
            totalPopSum: 0,
            headsPerDate: {}
          };
        }
        
        let dayPop = 0;
        let dayGrams = 0;
        
        prods.forEach(prod => {
          const mort = dayData.entries.find(
            (e) => e.type === "mortality" && e.buildingId === prod.buildingId
          );
          
          const heads = prod.currentHeads || 0;
          dayPop += heads;
          history[yearMonth].bags += prod.feed?.bags || 0;
          history[yearMonth].pieces += prod.production?.totalPieces || 0;
          history[yearMonth].mortality += mort?.totalMortality ?? prod.mortalityCount ?? 0;
          history[yearMonth].culls += prod.culls || 0;
          dayGrams += (prod.feed?.gramsPerBirdDay || 0) * heads;
        });
        
        history[yearMonth].days += 1;
        history[yearMonth].totalGramsSum += dayGrams;
        history[yearMonth].totalPopSum += dayPop;
        
        if (!history[yearMonth].headsPerDate[dateStr]) {
          history[yearMonth].headsPerDate[dateStr] = 0;
        }
        history[yearMonth].headsPerDate[dateStr] += dayPop;
      });
      
      return Object.values(history).map(mo => {
        const avgFeed = mo.totalPopSum > 0 ? (mo.totalGramsSum / mo.totalPopSum).toFixed(1) : "0.0";
        const avgProd = mo.totalPopSum > 0 ? ((mo.pieces / mo.totalPopSum) * 100).toFixed(2) : "0.00";
        
        const datesInMonth = Object.keys(mo.headsPerDate).sort();
        const latestDate = datesInMonth[datesInMonth.length - 1];
        const latestHeads = mo.headsPerDate[latestDate] || 0;
        
        const d = new Date(mo.month + "-01T00:00:00");
        const monthLabel = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        
        return {
          month: mo.month,
          monthLabel,
          heads: latestHeads,
          bags: mo.bags,
          avgFeed,
          totalEggs: mo.pieces,
          avgProd,
          mortality: mo.mortality,
          culls: mo.culls
        };
      }).sort((a, b) => b.month.localeCompare(a.month));
    });

    // Paginated Daily History
    const paginatedDailyHistory = computed(() => {
      const start = (dailyCurrentPage.value - 1) * entriesPerPage.value;
      const end = start + entriesPerPage.value;
      return filteredDailyHistory.value.slice(start, end);
    });
    const dailyTotalPages = computed(() => Math.ceil(filteredDailyHistory.value.length / entriesPerPage.value) || 1);

    // Paginated Weekly History
    const paginatedWeeklyHistory = computed(() => {
      const start = (weeklyCurrentPage.value - 1) * entriesPerPage.value;
      const end = start + entriesPerPage.value;
      return weeklyHistoryTable.value.slice(start, end);
    });
    const weeklyTotalPages = computed(() => Math.ceil(weeklyHistoryTable.value.length / entriesPerPage.value) || 1);

    // Paginated Monthly History
    const paginatedMonthlyHistory = computed(() => {
      const start = (monthlyCurrentPage.value - 1) * entriesPerPage.value;
      const end = start + entriesPerPage.value;
      return monthlyHistoryTable.value.slice(start, end);
    });
    const monthlyTotalPages = computed(() => Math.ceil(monthlyHistoryTable.value.length / entriesPerPage.value) || 1);


    // Necropsy computed helpers
    const necropsyTotal = computed(() => {
      return (
        currentMort.value?.totalMortality ??
        currentProd.value?.mortalityCount ??
        0
      );
    });

    const necropsyDateFormatted = computed(() => {
      if (!selectedDate.value) return "";
      const d = new Date(selectedDate.value + "T00:00:00");
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    });

    const necropsyNotes = computed(() => {
      const raw = currentMort.value?.notes || "";
      if (!raw.trim()) return [];
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    });

    // Egg Summary Formatting — driven by manifest.json meta.eggSizes
    const EGG_SIZES = computed(() => {
      const sizes = appConfig.value?.eggSizes;
      if (sizes && sizes.length) {
        return sizes.map(({ key, label }) => [key, label]);
      }
      // Fallback if manifest hasn't loaded yet
      return [
        ["nnv", "NNV"], ["nv", "NV"], ["no_weight", "NO WEIGHT"],
        ["pullet", "PULLET"], ["pewee", "PEEWEE"], ["small", "SMALL"],
        ["medium", "MEDIUM"], ["large", "LARGE"], ["larger", "LARGER"],
        ["xlarge", "X-LARGE"], ["jumbo", "JUMBO"], ["s_jumbo", "S-JUMBO"],
        ["broken", "BROKEN"], ["bold", "BOLD"], ["loss", "LOSS"],
      ];
    });

    const eggSummaryRows = computed(() => {
      const rows = EGG_SIZES.value.map(([key, label]) => {
        const dist = currentEgg.value?.distribution?.[key] || {};
        const c = parseInt(dist.cases) || 0;
        const t = parseInt(dist.trays) || 0;
        const p = parseInt(dist.pieces) || 0;
        const computedTotal = c * 360 + t * 30 + p;

        return {
          key,
          label,
          cases: c,
          trays: t,
          pieces: p,
          total: computedTotal,
        };
      });

      const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

      return rows.map((r) => ({
        ...r,
        percentage:
          grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : "0.0",
      }));
    });

    const eggTotals = computed(() => {
      const stats = eggSummaryRows.value.reduce(
        (acc, row) => {
          acc.total += row.total;
          acc.cases += row.cases;
          acc.trays += row.trays;
          acc.pieces += row.pieces;
          return acc;
        },
        { total: 0, cases: 0, trays: 0, pieces: 0 },
      );

      return {
        ...stats,
        percentage: stats.total > 0 ? 100 : 0,
      };
    });



    function formatDefect(defectData) {
      if (typeof defectData === "number") {
        const total = defectData;
        const cases = Math.floor(total / 360);
        const rem = total % 360;
        const trays = Math.floor(rem / 30);
        const pieces = rem % 30;
        return { cases, trays, pieces, total };
      } else if (defectData && typeof defectData === "object") {
        const cases = parseInt(defectData.cases) || 0;
        const trays = parseInt(defectData.trays) || 0;
        const pieces = parseInt(defectData.pieces) || 0;
        const total =
          defectData.total ??
          defectData.totalPieces ??
          defectData.total_pieces ??
          cases * 360 + trays * 30 + pieces;
        return { cases, trays, pieces, total };
      }
      return { cases: 0, trays: 0, pieces: 0, total: 0 };
    }

    const eggDefects = computed(() => {
      const egg = currentEgg.value || {};
      const dist = egg.distribution || {};
      return {
        goodCracks: formatDefect(dist.goodCracks ?? dist.good_cracks),
        badCracks: formatDefect(dist.badCracks ?? dist.bad_cracks),
        mishapen: formatDefect(dist.mishapen ?? dist.misshapen),
        totalPieces: {
          cases: egg.cases ?? eggTotals.value.cases,
          trays: egg.trays ?? eggTotals.value.trays,
          pieces: egg.pieces ?? eggTotals.value.pieces,
          total: egg.totalPieces ?? eggTotals.value.total,
        },
      };
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
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const weekday = d
        .toLocaleDateString("en-US", { weekday: "short" })
        .toUpperCase();

      const heads = prod?.currentHeads ?? b.startingHeads ?? 0;
      const pieces = prod?.production?.totalPieces ?? 0;
      const prodCases = prod?.production?.cases ?? 0;
      const prodPercent =
        heads > 0 ? ((pieces / heads) * 100).toFixed(2) : "0.00";
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

      eggSummaryRows.value.forEach((row) => {
        const pcsStr = row.total;
        const pctStr = row.percentage !== "-" ? row.percentage : "";
        txt += `${row.label.padEnd(10)}\t${pcsStr}\t${pctStr}\n`;
      });
      const totPcsStr = eggTotals.value.total || "";
      const totPctStr = eggTotals.value.percentage
        ? eggTotals.value.percentage.toFixed(1)
        : "";
      txt += `TOTAL     \t${totPcsStr}\t${totPctStr}\n\n`;


      txt += `TOTAL MORTALITIES: ${mortalityCount}\n`;
      if (mort?.mortality?.length) {
        mort.mortality.forEach((mr) => {
          txt += `${mr.cause || "Unknown"}: ${mr.count ?? 0}${mr.notes ? " (" + mr.notes + ")" : ""}\n`;
        });
      } else if (mort?.notes) {
        txt += `${mort.notes}\n`;
      } else {
        txt += `(none)\n`;
      }
      txt += `\n`;

      const notes = [prod?.notes, med?.notes].filter(Boolean).join("\n");
      txt += `HAPPENINGS / NOTES:\n`;
      txt += `${notes || "(none)"}\n\n`;

      txt += `WEATHER:\n`;
      txt += `AM:        ${prod?.weatherAm || ""}\n`;
      txt += `PM:        ${prod?.weatherPm || ""}\n`;
      txt += `TEMP:      ${prod?.temperature || ""}`;

      return txt;
    });

    const copyToClipboard = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        window.alert("Successfully copied to clipboard!");
      } catch (err) {
        window.alert(
          "Failed to copy. Your browser might not support this feature.",
        );
      }
    };



    const eggSummaryText = computed(() => {
      if (!currentBuilding.value) return "";
      let t = `EGG SUMMARY - ${currentBuilding.value.name.toUpperCase()} (${selectedDate.value})\n`;
      t += `----------------------------------------\n`;
      t += `DEFECTS:\n`;
      t += `GOOD CRACKS: ${eggDefects.value.goodCracks.total} (${eggDefects.value.goodCracks.cases}C ${eggDefects.value.goodCracks.trays}T ${eggDefects.value.goodCracks.pieces}P)\n`;
      t += `BAD CRACKS:  ${eggDefects.value.badCracks.total} (${eggDefects.value.badCracks.cases}C ${eggDefects.value.badCracks.trays}T ${eggDefects.value.badCracks.pieces}P)\n`;
      t += `MISSHAPEN:   ${eggDefects.value.mishapen.total} (${eggDefects.value.mishapen.cases}C ${eggDefects.value.mishapen.trays}T ${eggDefects.value.mishapen.pieces}P)\n`;
      t += `TOTAL PIECES:${eggDefects.value.totalPieces.total} (${eggDefects.value.totalPieces.cases}C ${eggDefects.value.totalPieces.trays}T ${eggDefects.value.totalPieces.pieces}P)\n`;
      t += `----------------------------------------\n`;
      t += `SIZE         TOTAL    %      C   T   P\n`;
      t += `----------------------------------------\n`;
      eggSummaryRows.value.forEach((r) => {
        const perc = r.percentage !== "-" ? r.percentage + "%" : "-";
        t += `${r.label.padEnd(12)} ${String(r.total).padEnd(8)} ${perc.padEnd(6)} ${String(r.cases).padEnd(3)} ${String(r.trays).padEnd(3)} ${r.pieces}\n`;
      });
      t += `----------------------------------------\n`;
      const totPerc = eggTotals.value.percentage
        ? eggTotals.value.percentage.toFixed(1) + "%"
        : "-";
      t += `TOTAL        ${String(eggTotals.value.total || "-").padEnd(8)} ${totPerc.padEnd(6)} ${String(eggTotals.value.cases || "-").padEnd(3)} ${String(eggTotals.value.trays || "-").padEnd(3)} ${eggTotals.value.pieces || "-"}\n`;
      return t;
    });

    function stripHtml(html) {
      if (!html) return "";
      const tmp = document.createElement("DIV");
      tmp.innerHTML = html;
      return tmp.textContent || tmp.innerText || "";
    }

    const necropsyFontSize = Vue.ref(16);
    const farmName = computed(() => appConfig.value?.farmName || "Farm Dashboard");
    const dashboardTitle = computed(() => appConfig.value?.dashboardTitle || "Daily Report");

    return {
      isLoggedIn,
      passwordInput,
      loginError,
      checkLogin,
      showPassword,
      logout,
      necropsyFontSize,
      farmName,
      dashboardTitle,
      selectedYear,
      selectedMonth,
      selectedDate,
      selectedBuildingId,
      activeTab,
      availableYears,
      availableMonths,
      daysInMonthList,
      currentBuildings,
      currentBuilding,
      dashboardMetrics,
      selectDate,
      selectBuilding,
      formatAge,
      activeDateBtn,
      dailyReportText,
      eggSummaryRows,
      eggTotals,
      eggDefects,
      eggSummaryText,
      sortedAllBuildings,
      isFullScreenTable,
      isFullScreenReport,
      copyToClipboard,
      getProdClass,

      stripHtml,
      tableFontSize,
      getPerformanceLabel,
      currentProd,
      currentMort,
      currentEgg,
      currentMed,
      currentEntries,
      necropsyTotal,
      necropsyNotes,
      necropsyDateFormatted,
      weeklyHistoryTable,
      dailyHistoryTable,
      activeSubTab,
      monthlyHistoryTable,
      activeOverviewSubTab,
      dailyCurrentPage,
      weeklyCurrentPage,
      monthlyCurrentPage,
      entriesPerPage,
      paginatedDailyHistory,
      paginatedWeeklyHistory,
      paginatedMonthlyHistory,
      dailyTotalPages,
      weeklyTotalPages,
      monthlyTotalPages,
      dailyMonthFilter,
      dailySearchQuery,
      availableMonthsInDaily,
      filteredDailyHistory,
    };
  },
});

app.mount("#app");
