import { By } from 'selenium-webdriver';

export const getPageRating = async (
  driver: any,
  name: string,
): Promise<string[] | string> => {
  await driver.sleep(2000);
  const hiddenElements = await driver.findElements(By.className('F7nice'));

  if (hiddenElements.length === 0) {
    return [];
  }

  const ratings = [];

  // Optionally, log some details about each element
  try {
    for (const [, element] of hiddenElements.entries()) {
      const children = await element.findElements(By.xpath('./*'));

      if (children.length !== 2) continue;

      const firstChildren = await children[0].findElements(By.xpath('./*'));

      // rating is the first child of firstChildren
      const rating = await firstChildren[0].getText();

      ratings.push(rating);
      return ratings.length > 1 ? null : ratings[0];
    }
  } catch (error) {
    console.error(`Error on record ${name}:`);
    await driver.get('https://www.google.com/');
    return null;
  }
};
