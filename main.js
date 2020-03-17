const Apify = require('apify');
const moment = require('moment-timezone');
const _ = require('lodash');

const { log } = Apify.utils;
log.setLevel(log.LEVELS.WARNING);

const LATEST ='LATEST';

Apify.main(async () => {
    const sourceUrl = 'https://www.gov.si/en/news/2020-03-12-slovenia-declares-coronavirus-epidemic/';
    const kvStore = await Apify.openKeyValueStore("COVID-19-SLOVENIA");
    const dataset = await Apify.openDataset("COVID-19-SLOVENIA-HISTORY");

    const requestList = new Apify.RequestList({
        sources: [
            { url: sourceUrl },
        ],
    });
    await requestList.initialize();

    const crawler = new Apify.CheerioCrawler({
        requestList,
        maxRequestRetries: 1,
        handlePageTimeoutSecs: 60,

        handlePageFunction: async ({ request, $ }) => {
            log.info(`Processing ${request.url}...`);

            const data = {
                sourceUrl,
                lastUpdatedAtApify: moment().utc().second(0).millisecond(0).toISOString(),
                readMe: "https://apify.com/dtrungtin/covid-si",
            };

            const confirmedDateText = $('time').text();
            const matchUpadatedAt = confirmedDateText.match(/(\d+).\s+(\d+).\s+(\d+)/);

            if (matchUpadatedAt && matchUpadatedAt.length > 3) {
                //const dateTimeStr = `${matchUpadatedAt[3]}.${matchUpadatedAt[2]}.${matchUpadatedAt[1]}`;
                //const dateTime = moment.tz(dateTimeStr, "YYYY.MM.DD", 'Europe/Ljubljana');
                //data.lastUpdatedAtSource = dateTime.toISOString();

                data.lastUpdatedAtSource = moment({
                    year: parseInt(matchUpadatedAt[3]),
                    month: parseInt(matchUpadatedAt[2]) - 1,
                    date: parseInt(matchUpadatedAt[1]),
                    hour: 0,
                    minute: 0,
                    second: 0,
                    millisecond: 0
                }).toISOString();
            } else {
                throw new Error('lastUpdatedAtSource not found');
            }

            const numberOfCases = $('.content-blocks').text();
            const [skip, confirmed] = numberOfCases.match(/(\d+) confirmed/);
            data.confirmedCases = parseInt(confirmed);

            // Compare and save to history
            const latest = await kvStore.getValue(LATEST) || {};
            if (!_.isEqual(_.omit(data, 'lastUpdatedAtApify'), _.omit(latest, 'lastUpdatedAtApify'))) {
                await dataset.pushData(data);
            }

            await kvStore.setValue(LATEST, data);
            await Apify.pushData(data);
        },

        handleFailedRequestFunction: async ({ request }) => {
            log.info(`Request ${request.url} failed twice.`);
        },
    });

    await crawler.run();

    log.info('Crawler finished.');
});
