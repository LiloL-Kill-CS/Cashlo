const { calculateDailyPrediction } = require('./src/lib/regionalIntelligence');

// Mock Data
const mockDate = new Date();
const prediction = calculateDailyPrediction(mockDate);

console.log("=== DEEP PREDICTION ENGINE TEST ===");
console.log(`Date: ${prediction.date}`);
console.log(`Revenue Mid: ${prediction.predicted_revenue.mid}`);
console.log(`Profit (Est): ${prediction.estimated_profit}`);
console.log(`Margin: ${prediction.profit_margin_percent}%`);
console.log("Factors:");
prediction.factors.forEach(f => console.log(`- ${f.name} (${f.impact})`));
console.log("Recommendations:");
prediction.recommendations.forEach(r => console.log(`- ${r}`));

if (prediction.profit_margin_percent && prediction.factors.length > 0) {
    console.log("SUCCESS: Deep Logic is active.");
} else {
    console.log("FAIL: Logic missing.");
}
