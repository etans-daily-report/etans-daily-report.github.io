const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;

const app = createApp({
    setup() {
        // State
        const dates = ref([]);
        const selectedDate = ref(null);
        const selectedYear = ref(null);
        const selectedMonth = ref(null);
        const buildingsData = ref({});
        const selectedBuildingId = ref('ALL');
        const activeTab = ref('dailyreport');
        const isFullScreenTable = ref(false);
        const isFullScreenReport = ref(false);
        const isFullScreenNecropsy = ref(false);
        const analyticsRange = ref('7');
        const analyticsSubTab = ref('charts');
        const loadingAnalytics = ref(false);
        const analyticsData = ref([]);
        const kpiData = ref([]);
        let productionChart = null;
        let mortalityChart = null;
        let eggSizeChart = null;
        
        
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
                
                // Hide the loading overlay when data is ready
                const loader = document.getElementById('loading-overlay');
                if (loader) loader.style.display = 'none';
                
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
            if (selectedBuildingId.value !== 'ALL') {
                const buildingExists = dateData.buildings.some(b => b.id === selectedBuildingId.value);
                if (!selectedBuildingId.value || !buildingExists) {
                    selectedBuildingId.value = 'ALL';
                }
            }
        }

        function selectBuilding(id) {
            selectedBuildingId.value = id;
            if (activeTab.value === 'analytics') {
                nextTick(() => fetchAnalyticsData());
            }
        }

        watch(activeTab, (newTab) => {
            if (newTab === 'analytics') {
                nextTick(() => fetchAnalyticsData());
            }
        });

        watch(analyticsSubTab, () => {
            nextTick(() => {
                if (activeTab.value === 'analytics') initCharts();
            });
        });

        let fetchTimeout = null;
        async function fetchAnalyticsData() {
            // Debounce to prevent rapid-fire clicks
            if (fetchTimeout) clearTimeout(fetchTimeout);
            
            fetchTimeout = setTimeout(async () => {
                if (loadingAnalytics.value) return;
                loadingAnalytics.value = true;
                
                try {
                    const range = analyticsRange.value;
                    let targetDates = [...dates.value].sort((a, b) => new Date(b) - new Date(a));
                    
                    if (range !== 'ALL') {
                        targetDates = targetDates.slice(0, parseInt(range));
                    }
                    targetDates.reverse();

                    const results = [];
                    for (const dateStr of targetDates) {
                        if (!buildingsData.value[dateStr]) {
                            await loadDateData(dateStr);
                        }
                        if (buildingsData.value[dateStr]) {
                            results.push(buildingsData.value[dateStr]);
                        }
                    }
                    // Force reactivity by replacing the entire array
                    analyticsData.value = [...results];
                    
                    calculateKPIs();
                    // Double nextTick for extra safety with Chart.js canvases
                    nextTick(() => {
                        nextTick(() => initCharts());
                    });
                } finally {
                    loadingAnalytics.value = false;
                }
            }, 50); // Small delay to catch rapid clicks
        }

        function calculateKPIs() {
            const buildingsMap = {};
            
            analyticsData.value.forEach(day => {
                const buildings = day.buildings || [];
                const entries = day.entries || [];
                
                buildings.forEach(b => {
                    if (!buildingsMap[b.id]) {
                        buildingsMap[b.id] = { 
                            name: b.name, 
                            totalProd: 0, 
                            totalEggs: 0,
                            totalHeads: 0,
                            totalRejects: 0,
                            count: 0, 
                            totalMort: 0, 
                            totalFeed: 0, 
                            totalGrams: 0,
                            feedEntries: 0
                        };
                    }
                    
                    const prod = entries.find(e => e.buildingId === b.id && e.type === 'production');
                    const mort = entries.find(e => e.buildingId === b.id && e.type === 'mortality');
                    const eggSummary = entries.find(e => e.buildingId === b.id && e.type === 'egg-summary');
                    
                    const heads = prod?.currentHeads ?? b.startingHeads ?? 0;
                    const pieces = prod?.production?.totalPieces ?? 0;
                    const prodPercent = heads > 0 ? (pieces / heads) * 100 : 0;
                    const mortCount = mort?.totalMortality ?? prod?.mortalityCount ?? 0;
                    
                    // Quality / Rejects
                    const goodCracks = eggSummary?.goodCracks?.total || 0;
                    const badCracks = eggSummary?.badCracks?.total || 0;
                    const misshapen = eggSummary?.mishapen?.total || 0;
                    const rejects = badCracks + misshapen;

                    buildingsMap[b.id].totalProd += prodPercent;
                    buildingsMap[b.id].totalEggs += pieces;
                    buildingsMap[b.id].totalHeads += heads;
                    buildingsMap[b.id].totalRejects += rejects;
                    buildingsMap[b.id].count += 1;
                    buildingsMap[b.id].totalMort += mortCount;
                    
                    if (prod?.feed) {
                        buildingsMap[b.id].totalFeed += prod.feed.bags || 0;
                        buildingsMap[b.id].totalGrams += prod.feed.gramsPerBirdDay || 0;
                        buildingsMap[b.id].feedEntries += 1;
                    }
                });
            });
            
            kpiData.value = Object.keys(buildingsMap).map(id => {
                const b = buildingsMap[id];
                const lastDay = analyticsData.value[analyticsData.value.length - 1];
                const lastDayBldg = lastDay?.buildings.find(bl => bl.id === id);
                const lastDayEgg = lastDay?.entries.find(e => e.buildingId === id && e.type === 'egg-summary');
                
                const startHeads = lastDayBldg?.startingHeads || 0;
                
                // Use the framework to calculate advanced metrics
                const avgHD = b.totalProd / b.count;
                const totalBirds = b.totalHeads;
                const avgEggMass = totalBirds > 0 ? (b.totalEggs * 61.5) / totalBirds : 0;
                const totalFeedGrams = b.totalFeed * 50000;
                const totalEggMassGrams = (b.totalEggs * 61.5);
                
                const metrics = {
                    henDay: avgHD,
                    mortalityRate: b.totalMort / (startHeads * b.count || 1) * 100, // Normalized
                    fcr: totalEggMassGrams > 0 ? totalFeedGrams / totalEggMassGrams : 0,
                    saleablePercent: b.totalEggs > 0 ? ((b.totalEggs - b.totalRejects) / b.totalEggs) * 100 : 0,
                    livability: (totalBirds / (startHeads * b.count || 1)) * 100
                };

                const scoreData = window.KPIFramework.calculateIntelligenceScore(metrics);
                
                return {
                    buildingId: id,
                    name: b.name,
                    avgHenDay: avgHD,
                    avgHenHouse: startHeads > 0 ? (b.totalEggs / (startHeads * b.count)) * 100 : 0,
                    avgEggMass: avgEggMass,
                    fcr: metrics.fcr,
                    saleablePercent: metrics.saleablePercent,
                    totalMort: b.totalMort,
                    totalFeed: b.totalFeed,
                    avgGrams: b.feedEntries > 0 ? b.totalGrams / b.feedEntries : 0,
                    intelligence: scoreData
                };
            }).sort((a, b) => b.avgHenDay - a.avgHenDay);
        }

        function getProdClass(val) {
            // Updated to Hisex White Elite Standards
            if (val >= 92) return 'prod-high';
            if (val >= 82) return 'prod-mid';
            return 'prod-low';
        }

        let chartRetryCount = 0;
        function initCharts() {
            if (activeTab.value !== 'analytics') return;
            
            const prodCtx = document.getElementById('productionChart');
            const mortCtx = document.getElementById('mortalityChart');
            const sizeCtx = document.getElementById('eggSizeChart');

            // If elements are missing but we're in the analytics tab, retry once
            if ((analyticsSubTab.value === 'charts' && (!prodCtx || !mortCtx)) || 
                (analyticsSubTab.value === 'eggs' && !sizeCtx)) {
                if (chartRetryCount < 3) {
                    chartRetryCount++;
                    setTimeout(initCharts, 100);
                    return;
                }
            }
            chartRetryCount = 0;

            // Production and Mortality (Trends sub-tab)
            if (analyticsSubTab.value === 'charts' && prodCtx && mortCtx) {
                if (productionChart) productionChart.destroy();
                if (mortalityChart) mortalityChart.destroy();
                
                // ... (rest of chart code remains same but inside this safety check)

                const labels = analyticsData.value.map(d => d.date.split('-').slice(1).join('/'));

                productionChart = new Chart(prodCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'HD Production %',
                            data: analyticsData.value.map(d => {
                                const entries = selectedBuildingId.value === 'ALL' ? d.entries : d.entries.filter(e => e.buildingId === selectedBuildingId.value);
                                const prodEntries = entries.filter(e => e.type === 'production');
                                if (!prodEntries.length) return 0;
                                let totalEggs = 0, totalBirds = 0;
                                prodEntries.forEach(e => {
                                    totalEggs += e.production?.totalPieces || 0;
                                    totalBirds += e.currentHeads || 0;
                                });
                                return totalBirds > 0 ? (totalEggs / totalBirds) * 100 : 0;
                            }),
                            borderColor: '#00ff9d',
                            backgroundColor: 'rgba(0, 255, 157, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { color: 'rgba(255,255,255,0.05)' } } }
                    }
                });

                mortalityChart = new Chart(mortCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Mortality',
                            data: analyticsData.value.map(d => {
                                const entries = selectedBuildingId.value === 'ALL' ? d.entries : d.entries.filter(e => e.buildingId === selectedBuildingId.value);
                                return entries.filter(e => e.type === 'production' || e.type === 'mortality').reduce((sum, e) => sum + (e.totalMortality ?? e.mortalityCount ?? 0), 0);
                            }),
                            backgroundColor: '#ef4444'
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { color: 'rgba(255,255,255,0.05)' } } }
                    }
                });
            }

            // Egg Size Distribution (Eggs sub-tab)
            if (analyticsSubTab.value === 'eggs') {
                if (!sizeCtx) return;
                
                if (eggSizeChart) eggSizeChart.destroy();
                const totals = calculateEggSizeTotals();
                const labels = Object.values(totals).map(t => t.label);
                const values = Object.values(totals).map(t => t.val);

                eggSizeChart = new Chart(sizeCtx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: values,
                            backgroundColor: [
                                '#f59e0b', '#fbbf24', '#10b981', '#3b82f6', 
                                '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', 
                                '#f43f5e', '#ef4444', '#78350f', '#4b5563'
                            ]
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { 
                            legend: { 
                                position: 'right', 
                                labels: { color: '#cbd5e1', font: { size: 10 } } 
                            } 
                        }
                    }
                });
            }
        }

        function calculateEggSizeTotals() {
            const sizeTotals = {};
            EGG_SIZES.forEach(([key, label]) => sizeTotals[key] = { label, val: 0 });
            
            analyticsData.value.forEach(day => {
                const entries = selectedBuildingId.value === 'ALL' 
                    ? day.entries.filter(e => e.type === 'egg-summary')
                    : day.entries.filter(e => e.type === 'egg-summary' && e.buildingId === selectedBuildingId.value);
                
                entries.forEach(e => {
                    EGG_SIZES.forEach(([key]) => {
                        const dist = e.distribution?.[key] || {};
                        sizeTotals[key].val += (dist.total ?? dist.totalPieces ?? dist.total_pieces ?? 0);
                    });
                });
            });

            const eggLabels = EGG_SIZES.map(([key, label]) => label);
            const eggData = EGG_SIZES.map(([key]) => sizeTotals[key].val);

            if (eggSizeChart) eggSizeChart.destroy();
            eggSizeChart = new Chart(ctxEgg, {
                type: 'doughnut',
                data: {
                    labels: eggLabels,
                    datasets: [{
                        data: eggData,
                        backgroundColor: [
                            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899',
                            '#06b6d4', '#84cc16', '#f97316', '#a855f7', '#64748b', '#475569',
                            '#334155', '#1e293b'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#fff', font: { size: 10 } } }
                    }
                }
            });
        }

        const analyticsInsights = computed(() => {
            if (!analyticsData.value.length) return null;
            
            const lastDay = analyticsData.value[analyticsData.value.length - 1];
            if (!lastDay) return null;

            let html = "";
            
            /**
             * Hisex White Management Guide Standards (Hendrix Genetics)
             * Peak: 95.0% - 96.5%
             * Feed Intake: 106g - 117g / bird / day
             * Persistency: >85% at 70 weeks
             * 50% Prod: 145 Days (Week 21)
             */
            const HI_SEX_STANDARDS = {
                peak: 95.0,
                elite: 92.0,
                good: 85.0,
                feedMin: 106,
                feedMax: 117,
                onsetWeek: 21
            };

            if (selectedBuildingId.value === 'ALL') {
                const avgProd = kpiData.value.reduce((acc, k) => acc + k.avgProd, 0) / kpiData.value.length;
                const totalMort = kpiData.value.reduce((acc, k) => acc + k.totalMort, 0);
                
                html += `<p><b>Farm-Wide Performance Analysis:</b> Your farm is currently averaging <span class="${getProdClass(avgProd)}">${avgProd.toFixed(1)}%</span> production.</p>`;
                
                if (avgProd >= HI_SEX_STANDARDS.peak) {
                    html += `<p class="standard-text">🌟 <b>Genetic Potential:</b> You are achieving the <b>Absolute Peak (95%+)</b> for Hisex White. This level of persistency is world-class.</p>`;
                } else if (avgProd >= HI_SEX_STANDARDS.elite) {
                    html += `<p class="standard-text">✅ <b>Elite Range:</b> Production is above 92%. This is the target "Elite" zone for modern high-yield hybrids.</p>`;
                } else if (avgProd >= HI_SEX_STANDARDS.good) {
                    html += `<p class="standard-text">⚠️ <b>Sub-Peak:</b> While ${avgProd.toFixed(1)}% is stable, Hisex White should ideally stay above 90% for the first 30 weeks of lay.</p>`;
                } else {
                    html += `<p class="standard-text">🔴 <b>Efficiency Gap:</b> Average is below 85%. Standard Hisex persistence should not drop below 85% until after 70 weeks of age.</p>`;
                }
            } else {
                const bId = selectedBuildingId.value;
                const kpi = kpiData.value.find(k => k.buildingId === bId);
                const b = lastDay.buildings.find(b => b.id === bId);
                
                if (!kpi || !b) return null;

                const breed = b.breed || 'Hisex White';
                html += `<p><b>${b.name} (${breed}) Insight:</b> At ${formatAge(b.ageWeeks, b.ageDays)}, current performance is <span class="${getProdClass(kpi.avgProd)}">${kpi.avgProd.toFixed(1)}%</span>.</p>`;

                // Detailed Age-Based Reasoning
                if (b.ageWeeks < HI_SEX_STANDARDS.onsetWeek) {
                    html += `<p>🐣 <b>Maturity Phase:</b> Breed standard reaches 50% production at Day 145 (W21). You are currently ${HI_SEX_STANDARDS.onsetWeek - b.ageWeeks} weeks away from the start of the curve.</p>`;
                } else if (b.ageWeeks >= 21 && b.ageWeeks <= 45) {
                    const diff = HI_SEX_STANDARDS.peak - kpi.avgProd;
                    if (diff <= 0) {
                        html += `<p>🏆 <b>Peak Standard:</b> Surpassing the breed peak of 95%. Excellent management of the "onset of lay" period.</p>`;
                    } else if (diff < 3) {
                        html += `<p>🥚 <b>Optimal Performance:</b> You are within 3% of the genetic ceiling. Maintain peak lighting hours (16h).</p>`;
                    } else {
                        html += `<p>🔍 <b>Peak Gap Detected:</b> High-yield layers like ${breed} should be at 95%+ now. Current gap: ${diff.toFixed(1)}%. Check for peak feed nutrient density.</p>`;
                    }
                } else {
                    html += `<p>📉 <b>Persistence Analysis:</b> For ${breed}, the natural decline should only be ~0.5% per week. If your decline is steeper, check for liver health or calcium levels.</p>`;
                }

                // Feed Intake vs Standard
                if (kpi.avgGrams > 0) {
                    if (kpi.avgGrams < HI_SEX_STANDARDS.feedMin) {
                        html += `<p>🌾 <b>Feed Intake Alert:</b> Low intake (${kpi.avgGrams.toFixed(0)}g) vs Standard (106g). This will directly impact egg size and shell thickness.</p>`;
                    } else if (kpi.avgGrams > HI_SEX_STANDARDS.feedMax) {
                        html += `<p>🌾 <b>Over-consumption:</b> Intake (${kpi.avgGrams.toFixed(0)}g) exceeds the 117g elite target. This reduces feed conversion efficiency (FCR).</p>`;
                    } else {
                        html += `<p>🌾 <b>Optimal Nutrition:</b> Intake is perfectly aligned with the 106-117g Hisex standard.</p>`;
                    }
                }
            }

            return html;
        });

        const avgFarmHenDay = computed(() => {
            if (!kpiData.value.length) return 0;
            return kpiData.value.reduce((acc, k) => acc + k.avgHenDay, 0) / kpiData.value.length;
        });

        const avgFarmHenHouse = computed(() => {
            if (!kpiData.value.length) return 0;
            return kpiData.value.reduce((acc, k) => acc + k.avgHenHouse, 0) / kpiData.value.length;
        });

        const farmIntelligence = computed(() => {
            if (!kpiData.value.length) return { total: 0, status: { label: 'N/A' } };
            const avgScore = kpiData.value.reduce((acc, k) => acc + k.intelligence.total, 0) / kpiData.value.length;
            return window.KPIFramework.getScoreStatus(avgScore);
        });

        const farmScore = computed(() => {
            if (!kpiData.value.length) return 0;
            return Math.round(kpiData.value.reduce((acc, k) => acc + k.intelligence.total, 0) / kpiData.value.length);
        });

        const totalFarmEggs = computed(() => {
            let total = 0;
            analyticsData.value.forEach(day => {
                day.entries.filter(e => e.type === 'production').forEach(e => {
                    total += e.production?.totalPieces || 0;
                });
            });
            return total;
        });

        const totalFarmMort = computed(() => {
            let total = 0;
            analyticsData.value.forEach(day => {
                day.entries.filter(e => e.type === 'production' || e.type === 'mortality').forEach(e => {
                    total += (e.totalMortality ?? e.mortalityCount ?? 0);
                });
            });
            return total;
        });

        const avgBuildingHenDay = computed(() => {
            if (selectedBuildingId.value === 'ALL') return 0;
            const kpi = kpiData.value.find(k => k.buildingId === selectedBuildingId.value);
            return kpi ? kpi.avgHenDay : 0;
        });

        const avgBuildingHenHouse = computed(() => {
            if (selectedBuildingId.value === 'ALL') return 0;
            const kpi = kpiData.value.find(k => k.buildingId === selectedBuildingId.value);
            return kpi ? kpi.avgHenHouse : 0;
        });

        const totalBuildingEggs = computed(() => {
            if (selectedBuildingId.value === 'ALL') return 0;
            let total = 0;
            analyticsData.value.forEach(day => {
                day.entries.filter(e => e.buildingId === selectedBuildingId.value && e.type === 'production').forEach(e => {
                    total += e.production?.totalPieces || 0;
                });
            });
            return total;
        });

        const totalBuildingMort = computed(() => {
            if (selectedBuildingId.value === 'ALL') return 0;
            let total = 0;
            analyticsData.value.forEach(day => {
                day.entries.filter(e => e.buildingId === selectedBuildingId.value && (e.type === 'production' || e.type === 'mortality')).forEach(e => {
                    total += (e.totalMortality ?? e.mortalityCount ?? 0);
                });
            });
            return total;
        });

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
            const data = buildingsData.value[selectedDate.value];
            if (!data || !data.buildings) return [];
            return [...data.buildings].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        });

        const currentBuilding = computed(() => {
            return currentBuildings.value.find(b => b.id === selectedBuildingId.value);
        });

        const currentEntries = computed(() => {
            if (!selectedDate.value || !buildingsData.value[selectedDate.value]) return [];
            return buildingsData.value[selectedDate.value].entries || [];
        });

        // View All Buildings Data
        const sortedAllBuildings = computed(() => {
            const buildings = currentBuildings.value;
            const entries = currentEntries.value;
            
            const mapped = buildings.map(b => {
                const prod = entries.find(e => e.buildingId === b.id && e.type === 'production');
                const heads = prod?.currentHeads ?? b.startingHeads ?? 0;
                const pieces = prod?.production?.totalPieces ?? 0;
                const percent = heads > 0 ? ((pieces / heads) * 100).toFixed(2) : "0.00";
                
                return {
                    ...b,
                    currentHeads: heads,
                    eggPercent: percent,
                    flockman: b.flockman || 'None',
                    totalDays: (b.ageWeeks * 7) + b.ageDays
                };
            });
            
            return mapped.sort((a, b) => a.name.localeCompare(b.name));
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

        function formatDefect(defectData) {
            if (typeof defectData === 'number') {
                const total = defectData;
                const cases = Math.floor(total / 360);
                const rem = total % 360;
                const trays = Math.floor(rem / 30);
                const pieces = rem % 30;
                return { cases, trays, pieces, total };
            } else if (defectData && typeof defectData === 'object') {
                return {
                    cases: defectData.cases || 0,
                    trays: defectData.trays || 0,
                    pieces: defectData.pieces || 0,
                    total: defectData.total ?? defectData.totalPieces ?? defectData.total_pieces ?? 0
                };
            }
            return { cases: 0, trays: 0, pieces: 0, total: 0 };
        }

        const eggDefects = computed(() => {
            const egg = currentEgg.value || {};
            return {
                goodCracks: formatDefect(egg.goodCracks ?? egg.good_cracks),
                badCracks: formatDefect(egg.badCracks ?? egg.bad_cracks),
                mishapen: formatDefect(egg.mishapen ?? egg.misshapen),
                totalPieces: {
                    cases: egg.cases ?? eggTotals.value.cases,
                    trays: egg.trays ?? eggTotals.value.trays,
                    pieces: egg.pieces ?? eggTotals.value.pieces,
                    total: egg.totalPieces ?? eggTotals.value.total
                }
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
            
            return txt;
        });

        const copyToClipboard = async (text) => {
            try {
                await navigator.clipboard.writeText(text);
                alert("Successfully copied to clipboard!");
            } catch (err) {
                alert("Failed to copy. Your browser might not support this feature.");
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
            eggSummaryRows.value.forEach(r => {
                const perc = r.percentage !== "-" ? r.percentage + "%" : "-";
                t += `${r.label.padEnd(12)} ${String(r.total).padEnd(8)} ${perc.padEnd(6)} ${String(r.cases).padEnd(3)} ${String(r.trays).padEnd(3)} ${r.pieces}\n`;
            });
            t += `----------------------------------------\n`;
            const totPerc = eggTotals.value.percentage ? eggTotals.value.percentage.toFixed(1) + "%" : "-";
            t += `TOTAL        ${String(eggTotals.value.total || "-").padEnd(8)} ${totPerc.padEnd(6)} ${String(eggTotals.value.cases || "-").padEnd(3)} ${String(eggTotals.value.trays || "-").padEnd(3)} ${eggTotals.value.pieces || "-"}\n`;
            return t;
        });

        return {
            selectedYear, selectedMonth, selectedDate, selectedBuildingId, activeTab,
            availableYears, availableMonths, daysInMonthList,
            currentBuildings, currentBuilding, dashboardMetrics,
            selectDate, selectBuilding, formatAge,
            activeDateBtn,
            dailyReportText,
            eggSummaryRows, eggTotals, eggDefects, eggSummaryText,
            necropsyReportText,
            sortedAllBuildings,
            isFullScreenTable,
            isFullScreenReport,
            isFullScreenNecropsy,
            copyToClipboard,
            analyticsRange,
            analyticsSubTab,
            loadingAnalytics,
            analyticsData,
            kpiData,
            analyticsInsights,
            avgFarmHenDay,
            avgFarmHenHouse,
            farmIntelligence,
            farmScore,
            totalFarmEggs,
            totalFarmMort,
            avgBuildingHenDay,
            avgBuildingHenHouse,
            totalBuildingEggs,
            totalBuildingMort,
            fetchAnalyticsData,
            getProdClass
        };
    }
});

app.mount('#app');
