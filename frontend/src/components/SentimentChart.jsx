// file: frontend/src/components/SentimentChart.jsx
import { ArcElement, Chart, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";

Chart.register(ArcElement, Tooltip, Legend);

const SENTIMENT_LABELS = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

const SENTIMENT_COLORS = {
  positive: "#22c55e",
  neutral: "#94a3b8",
  negative: "#ef4444",
};

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "bottom" },
  },
};

const SentimentChart = ({ stats }) => {
  const keys = Object.keys(SENTIMENT_LABELS);

  const chartData = {
    labels: keys.map((key) => SENTIMENT_LABELS[key]),
    datasets: [
      {
        data: keys.map((key) => stats[key] ?? 0),
        backgroundColor: keys.map((key) => SENTIMENT_COLORS[key]),
      },
    ],
  };

  return (
    <div className="h-[300px] max-h-[300px]">
      <Doughnut data={chartData} options={CHART_OPTIONS} />
    </div>
  );
};

export default SentimentChart;
