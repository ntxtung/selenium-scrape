import { Builder } from 'selenium-webdriver';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { concatMap, mergeMap, Observable } from 'rxjs';
import * as fs from 'fs';
import { getPageRating } from './scrape-test';
import * as chrome from 'selenium-webdriver/chrome';
import { format } from 'date-fns';
import { Place } from './interfaces/place.interface';
import { DriverPod } from './interfaces/driver-pod.interface';

const inputDataPath = './inputs/Places.csv';
const todayString = format(new Date(), 'yyyy-MM-dd-HH-mm-ss');
const outputDataPath = `./outputs/Places-${todayString}.csv`;

const getCsvReadObservable = (path: string): Observable<any> => {
  const fileContentStream = fs.createReadStream(path);
  const parser = parse({
    columns: true, // Parses the first line as column names
    delimiter: ',', // Delimits fields using a comma
    trim: true, // Trims leading and trailing spaces around fields,
    bom: true, // Handles BOM characters
  });

  return new Observable((subscriber) => {
    fileContentStream
      .pipe(parser)
      .on('data', (data) => subscriber.next(data))
      .on('error', (error) => subscriber.error(error))
      .on('end', () => subscriber.complete());
  });
};

const getCsvWriteStringify = (path: string) => {
  const outputStream = fs.createWriteStream(path, {
    encoding: 'utf8',
    flags: 'a',
  });
  const stringifier = stringify({
    header: true,
    delimiter: ',',
  });
  stringifier.on('readable', function () {
    let row;
    while ((row = stringifier.read()) !== null) {
      outputStream.write(row);
    }
  });
  // Catch any error
  stringifier.on('error', function (err) {
    console.error(err.message);
  });
  // When finished, validate the CSV output with the expected value
  stringifier.on('finish', function () {
    console.log('CSV file created successfully.');
    // close the stream
    outputStream.end();
  });
  return stringifier;
};

const scrapeGoogleMaps = async () => {
  const driversPool: DriverPod[] = [];

  const numberOfInstances = 5;

  // Set up Chrome options
  const options = new chrome.Options();
  options.addArguments('--headless'); // Run Chrome in headless mode
  // options.addArguments('--disable-gpu'); // Disable GPU acceleration (required for some environments)
  // options.addArguments('--no-sandbox'); // Bypass OS security model
  // options.addArguments('--disable-dev-shm-usage'); // Overcome limited resource problems

  for (let i = 0; i < numberOfInstances; i++) {
    driversPool.push({
      driverId: `driver-${i}`,
      driver: await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build(),
      isAvailable: true,
      lastUsed: new Date(),
    });
  }

  const outputObservable = getCsvWriteStringify(outputDataPath);

  getCsvReadObservable(inputDataPath)
    .pipe(
      // take(20),
      concatMap(async (data: Place) => {
        // while loop
        let driverPod = null;
        let iteration = 0;
        while (driverPod === null) {
          iteration++;
          if (iteration > 30) {
            console.warn(`Deadlock for ${data.name}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          // find available driver and further lastUsed
          const availableDrivers = driversPool.filter(
            (driver) => driver.isAvailable,
          );
          if (availableDrivers.length > 0) {
            driverPod = availableDrivers.sort(
              (a, b) => a.lastUsed.getTime() - b.lastUsed.getTime(),
            )[0];
            driverPod.isAvailable = false;
          }
        }

        return {
          driverPod,
          data,
        };
      }),
      mergeMap(async (dataWithDriver) => {
        const { driverPod, data } = dataWithDriver;
        const { driver } = driverPod;

        const url = data.googleMapUrl.replace('/review', '');
        console.log(`navigate to: "${url}"`);
        if (!url) {
          driverPod.isAvailable = true;
          return {
            ...data,
            rating: null,
          };
        }
        await driver.get(url);
        const rating = await getPageRating(driver, data.name);
        driverPod.isAvailable = true;

        return {
          ...data,
          googleMapUrl: url,
          rating,
        };
      }, numberOfInstances - 2),
    )
    .subscribe({
      next: (data) => {
        console.log(`Name: ${data.name}, Rating: ${data.rating}`);
        outputObservable.write(data);
      },
      complete: () => {
        console.log('Completed');
        driversPool.forEach((driverPod) => {
          driverPod.driver.quit();
        });
      },
    });
};

scrapeGoogleMaps();
