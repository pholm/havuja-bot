const QuickChart = require('quickchart-js');
import https = require('https');

import { IncomingMessage } from 'http';

export const createSkiChart = async (
    skiEntries: { timestamp: string; amount: number }[],
    deadlineDate: Date,
    bet: number,
): Promise<Buffer> => {
    const chart = new QuickChart();

    // prepare label array from first entry to deadline with 2 weeks interval
    const labels: Date[] = [];
    const currentDate = new Date(skiEntries[0].timestamp);
    while (currentDate < deadlineDate) {
        // create a new date object to avoid reference issues
        labels.push(new Date(currentDate));

        // append 2 weeks to the current date
        currentDate.setTime(currentDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    }
    // also add the deadline date
    labels.push(deadlineDate);

    chart.setConfig({
        type: 'line',
        data: {
            labels: labels.map((date) => date.toISOString().slice(0, 10)),
            datasets: [
                {
                    label: 'Skied',
                    data: [0, ...skiEntries.map((entry) => entry.amount)],
                    fill: true,
                    borderColor: 'blue',
                    tension: 0.1,
                },
                {
                    label: 'Bet',
                    data: labels.map(() => bet),
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointStyle: 'line',
                    borderDash: [5, 5],
                    borderColor: 'rgba(255, 0, 0, 0.3)', // Red with 50% opacity
                },
                {
                    label: 'Linear Trend',
                    data: labels.map(
                        (date, index) => (bet / (labels.length - 1)) * index,
                    ),
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line',
                    borderColor: 'rgba(0, 128, 0, 0.3)', // Green with 50% opacity
                },
            ],
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                },
            },
        },
    });

    const chartUrl = chart.getUrl();
    console.log(`Chart URL: ${chartUrl}`);

    return new Promise((resolve, reject) => {
        https
            .get(chartUrl, (response: IncomingMessage) => {
                const data = [];

                // Collect data as it comes in
                response.on('data', (chunk) => {
                    data.push(chunk);
                });

                // Resolve once all data is received
                response.on('end', () => {
                    const buffer = Buffer.concat(data);
                    resolve(buffer);
                });
            })
            .on('error', (err: Error) => {
                reject(new Error(`Error fetching the chart: ${err.message}`));
            });
    });
};
