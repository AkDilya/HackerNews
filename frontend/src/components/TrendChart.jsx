// file: frontend/src/components/TrendChart.jsx
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineElement,
  Legend,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    x: { title: { display: true, text: "Date" } },
    y: { title: { display: true, text: "Mentions" }, beginAtZero: true },
  },
};

const TrendChart = ({ data }) => {
  const chartData = {
    labels: data.map((point) => point.date),
    datasets: [
      {
        data: data.map((point) => point.count),
        borderColor: "#3b82f6",
        backgroundColor: "#3b82f6",
        tension: 0.3,
        spanGaps: true,
        pointRadius: 4,
      },
    ],
  };

  return (
    <div className="h-64">
      <Line data={chartData} options={CHART_OPTIONS} />
    </div>
  );
};

export default TrendChart;
