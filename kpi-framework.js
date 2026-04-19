/**
 * Core KPI Framework for Layer Poultry Production
 * Based on Standard Industry Benchmarks
 */

const KPIFramework = {
    // 1. PRODUCTION PERFORMANCE
    calculateProductionKPIs(data, history = []) {
        const totalEggs = data.production?.totalPieces || 0;
        const liveHens = data.currentHeads || 0;
        const startingHeads = data.startingHeads || 0;

        // Hen-Day Production (%)
        const henDay = liveHens > 0 ? (totalEggs / liveHens) * 100 : 0;

        // Hen-House Production (%)
        const henHouse = startingHeads > 0 ? (totalEggs / startingHeads) * 100 : 0;

        // Egg Mass (g/hen/day) - Estimating avg egg weight at 61g if not provided
        const avgEggWeight = 61.5; 
        const eggMass = liveHens > 0 ? (totalEggs * avgEggWeight) / liveHens : 0;

        return { henDay, henHouse, eggMass };
    },

    // 2. FLOCK HEALTH & SURVIVAL
    calculateHealthKPIs(data, startingHeads) {
        const deaths = data.totalMortality || data.mortalityCount || 0;
        const liveHens = data.currentHeads || 0;

        // Daily Mortality Rate (%)
        const mortalityRate = startingHeads > 0 ? (deaths / startingHeads) * 100 : 0;

        // Livability (%)
        const livability = startingHeads > 0 ? (liveHens / startingHeads) * 100 : 0;

        return { mortalityRate, livability, deaths };
    },

    // 3. FEED EFFICIENCY
    calculateFeedKPIs(data, eggMass) {
        const feedBags = data.feed?.bags || 0;
        const feedGramsTotal = feedBags * 50000; // 50kg per bag
        const liveHens = data.currentHeads || 0;
        const totalEggs = data.production?.totalPieces || 0;

        // Feed Conversion Ratio (FCR) = Feed intake / Egg Mass
        // Note: Both must be in same unit (grams). Egg Mass is per hen, so total egg mass is eggMass * liveHens
        const totalEggMassGrams = eggMass * liveHens;
        const fcr = totalEggMassGrams > 0 ? feedGramsTotal / totalEggMassGrams : 0;

        // Feed per Egg (g)
        const feedPerEgg = totalEggs > 0 ? feedGramsTotal / totalEggs : 0;

        // Feed per Bird (g)
        const feedPerBird = liveHens > 0 ? feedGramsTotal / liveHens : 0;

        return { fcr, feedPerEgg, feedPerBird };
    },

    // 4. EGG OUTPUT QUALITY
    calculateQualityKPIs(data, distribution) {
        const totalEggs = data.production?.totalPieces || 0;
        
        // Defects
        const goodCracks = distribution?.goodCracks?.total || 0;
        const badCracks = distribution?.badCracks?.total || 0;
        const misshapen = distribution?.mishapen?.total || 0;
        const totalRejects = badCracks + misshapen;

        // Saleable Egg Percentage
        const saleablePercent = totalEggs > 0 ? ((totalEggs - totalRejects) / totalEggs) * 100 : 0;

        // Defect Rate
        const defectRate = totalEggs > 0 ? (totalRejects / totalEggs) * 100 : 0;

        return { saleablePercent, defectRate, totalRejects };
    },

    // 5. ADVANCED SCORES & ANOMALY DETECTION
    calculateIntelligenceScore(metrics, history = []) {
        // PILLAR 1: PRODUCTION PERFORMANCE (30%)
        let prodScore = 0;
        if (metrics.henDay >= 95) prodScore = 30;
        else if (metrics.henDay >= 90) prodScore = 25;
        else if (metrics.henDay >= 85) prodScore = 20;
        else if (metrics.henDay >= 80) prodScore = 15;
        else prodScore = 10;

        // PILLAR 2: FLOCK HEALTH (20%)
        let healthScore = 0;
        if (metrics.mortalityRate < 0.05) healthScore = 20;
        else if (metrics.mortalityRate < 0.1) healthScore = 16;
        else if (metrics.mortalityRate < 0.3) healthScore = 12;
        else if (metrics.mortalityRate < 0.5) healthScore = 8;
        else healthScore = 0;

        // PILLAR 3: FEED EFFICIENCY (20%)
        let feedScore = 0;
        if (metrics.fcr <= 2.0 && metrics.fcr > 0) feedScore = 20;
        else if (metrics.fcr <= 2.2) feedScore = 16;
        else if (metrics.fcr <= 2.5) feedScore = 12;
        else if (metrics.fcr <= 3.0) feedScore = 8;
        else feedScore = 4;

        // PILLAR 4: EGG QUALITY (20%)
        let qualityScore = 0;
        if (metrics.saleablePercent >= 98) qualityScore = 20;
        else if (metrics.saleablePercent >= 96) qualityScore = 16;
        else if (metrics.saleablePercent >= 94) qualityScore = 12;
        else if (metrics.saleablePercent >= 90) qualityScore = 8;
        else qualityScore = 4;

        // PILLAR 5: STABILITY & TRENDS (10%)
        let stabilityScore = 8; // Baseline
        if (history.length > 2) {
            const lastThree = history.slice(-3).map(h => h.henDay);
            const variance = Math.max(...lastThree) - Math.min(...lastThree);
            if (variance < 1) stabilityScore = 10;
            else if (variance < 3) stabilityScore = 7;
            else stabilityScore = 4;
        }

        const total = prodScore + healthScore + feedScore + qualityScore + stabilityScore;
        
        return {
            total: Math.round(total),
            pillars: {
                production: prodScore,
                health: healthScore,
                feed: feedScore,
                quality: qualityScore,
                stability: stabilityScore
            },
            status: this.getScoreStatus(total)
        };
    },

    getScoreStatus(score) {
        if (score >= 85) return { label: 'Excellent', color: '#00ff9d', class: 'status-excellent' };
        if (score >= 70) return { label: 'Good', color: '#fbbf24', class: 'status-good' };
        if (score >= 55) return { label: 'Warning', color: '#f97316', class: 'status-warning' };
        return { label: 'Critical', color: '#ef4444', class: 'status-critical' };
    },

    // Aggregator for a single building's day
    analyzeDay(buildingData, eggSummaryData, startingHeads, history = []) {
        const prod = this.calculateProductionKPIs(buildingData);
        const health = this.calculateHealthKPIs(buildingData, startingHeads);
        const feed = this.calculateFeedKPIs(buildingData, prod.eggMass);
        const quality = this.calculateQualityKPIs(buildingData, eggSummaryData);
        
        const combined = { ...prod, ...health, ...feed, ...quality };
        const score = this.calculateIntelligenceScore(combined, history);

        return { ...combined, score };
    }
};

// Export for use in app.js
if (typeof module !== 'undefined') module.exports = KPIFramework;
else window.KPIFramework = KPIFramework;
