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
            timestamp: new Date(entry.timestamp),
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

    // add for the first date a 0 value, to the first position of the array
    cumulativeSkiData.unshift({ x: sortedSkiEntries[0].timestamp, y: 0 });

    const trendData = [
        { x: sortedSkiEntries[0].timestamp, y: 0 },
        { x: deadlineDate, y: bet },
    ];

    const betData = [
        { x: sortedSkiEntries[0].timestamp, y: bet },
        { x: deadlineDate, y: bet },
    ];

    // labels every two weeks from first entry to deadlineDate
    const labels = [];
    const firstEntry = sortedSkiEntries[0].timestamp;
    const diff = deadlineDate.getTime() - firstEntry.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    const weeks = Math.floor(days / 7);
    const step = Math.floor(weeks / 7);
    for (let i = 0; i < weeks; i += step) {
        const newDate = new Date(
            firstEntry.getTime() + i * 7 * 24 * 60 * 60 * 1000,
        );
        labels.push(newDate);
    }
    labels.push(deadlineDate);

    chart.setConfig({
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Skied',
                    data: cumulativeSkiData,
                    fill: true,
                    borderColor: 'blue',
                    tension: 0.1,
                },
                {
                    label: 'Bet',
                    data: betData,
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    pointStyle: 'line',
                    borderDash: [5, 5],
                    borderColor: 'rgba(255, 0, 0, 0.3)',
                },
                {
                    label: 'Linear',
                    data: trendData,
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
                                day: 'DD MMM YY',
                            },
                        },
                        max: deadlineDate,
                        ticks: {
                            source: 'labels',
                            major: {
                                enabled: true,
                            },
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
