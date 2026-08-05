/**
 * A season runs from whenever an admin opens it until 09:00 on the next 1st of
 * May. Dates are computed in the process timezone, which the container pins to
 * Europe/Helsinki so this lines up with the cron schedules.
 */
const SEASON_END_MONTH = 4; // May, zero-based
const SEASON_END_DAY = 1;
export const SEASON_END_HOUR = 9;

const mayFirstOf = (year: number) =>
    new Date(year, SEASON_END_MONTH, SEASON_END_DAY, SEASON_END_HOUR, 0, 0, 0);

/** 09:00 on the first 1st of May strictly after `from`. */
export const seasonEndAfter = (from: Date): Date => {
    const thisYear = mayFirstOf(from.getFullYear());
    return thisYear.getTime() > from.getTime()
        ? thisYear
        : mayFirstOf(from.getFullYear() + 1);
};

/** Pluralising helper shared by the countdown strings. */
const pluralize = (count: number, singular: string, plural: string): string =>
    `${count} ${count === 1 ? singular : plural}`;

/**
 * How long is left of a season, phrased for the chat. Mirrors the wording the
 * bot used when the deadline was a hardcoded constant.
 */
export const timeUntilString = (deadline: Date, now = new Date()): string => {
    if (deadline.getTime() <= now.getTime()) {
        return 'Wabu ei lobu';
    }

    let months = 0;
    const cursor = new Date(now);
    for (;;) {
        const next = new Date(cursor);
        next.setMonth(next.getMonth() + 1);
        if (next.getTime() > deadline.getTime()) break;
        cursor.setTime(next.getTime());
        months += 1;
    }

    const days = Math.floor(
        (deadline.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24),
    );

    return `Aikaa Wappuun ${pluralize(
        months,
        'kuukausi',
        'kuukautta',
    )} ja ${pluralize(days, 'päivä', 'päivää')}!`;
};
