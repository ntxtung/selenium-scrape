import { WebDriver } from 'selenium-webdriver';

export interface DriverPod {
  driverId?: string;
  driver: WebDriver;
  isAvailable: boolean;
  lastUsed?: Date;
}
