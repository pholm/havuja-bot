const QuickChart = require('quickchart-js');
import https = require('https');

import { IncomingMessage } from 'http';

export const createSkiChart = async (
    skiEntries: { timestamp: string; amount: number }[],
    deadlineDate: Date,
    bet: number,
): Promise<Buffer> => {
    const chart = new QuickChart();
    const sortedSkiEntries = skiEntries
        .map((entry) => ({
            timestamp: new Date(entry.timestamp), // Keep Date objects here
            amount: entry.amount,
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const cumulativeSkiData = sortedSkiEntries.reduce((acc, entry) => {
        const lastValue = acc.length > 0 ? acc[acc.length - 1].y : 0;
        acc.push({
            x: entry.timestamp,
            y: lastValue + entry.amount,
        });
        return acc;
    }, []);

    const trendData = sortedSkiEntries.map((entry, index) => ({
        x: entry.timestamp,
        y: (bet / (sortedSkiEntries.length - 1)) * index,
    }));

    const betData = sortedSkiEntries.map((entry) => ({
        x: entry.timestamp,
        y: bet,
    }));

    console.log('skidata', cumulativeSkiData);

    chart.setConfig({
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Skied',
                    data: cumulativeSkiData, // Use cumulative data with timestamps
                    fill: true,
                    borderColor: 'blue',
                    tension: 0.1,
                },
                {
                    label: 'Bet',
                    data: betData, // Use bet data with timestamps
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointStyle: 'line',
                    borderDash: [5, 5],
                    borderColor: 'rgba(255, 0, 0, 0.3)',
                },
                {
                    label: 'Linear Trend',
                    data: trendData, // Use trend data with timestamps
                    fill: false,
                    pointRadius: 0,
                    pointStyle: 'line',
                    borderColor: 'rgba(0, 128, 0, 0.3)',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                yAxes: [
                    {
                        beginAtZero: true,
                    },
                ],
                xAxes: [
                    {
                        type: 'time',
                        time: {
                            displayFormats: {
                                day: 'DD.MM.YYYY',
                            },
                        },
                        suggestedMax: deadlineDate,
                        ticks: {
                            source: 'data', // Use actual data points for ticks
                        },
                    },
                ],
            },
        },
    });

    const chartUrl = chart.getUrl();

    console.log('chartUrl', chartUrl);
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
