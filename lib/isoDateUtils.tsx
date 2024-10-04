// convert an ISO 8601 date string to a local date string
export function isoToLocalDateTime(isoDateString: string): string {
    // Create a Date object from the ISO 8601 date string
    const dateObj = new Date(isoDateString);

    // Get local date and time components from the Date object
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(dateObj.getDate()).padStart(2, "0");
    const hours = String(dateObj.getHours()).padStart(2, "0");
    const minutes = String(dateObj.getMinutes()).padStart(2, "0");
    const seconds = String(dateObj.getSeconds()).padStart(2, "0");
    const timeZoneAbbr = dateObj.toLocaleTimeString("en-us", { timeZoneName: "short" }).split(" ").pop(); // Get local time zone abbreviation

    // Format the local date time string as desired
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${timeZoneAbbr}`;
    }
// calculate the time since a given date using the isoDatetime
  export function isoTimeSinceDate(isoDateString: string): { years: number; months: number; weeks: number; days: number; hours: number; minutes: number } {
        // Create a Date object from the ISO 8601 date string
        const startDate = new Date(isoDateString);
        // Get the current date and time
        const endDate = new Date();
        // Calculate the difference in milliseconds between the two dates
        const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
        // Convert the difference to years, months, weeks, days, hours, and minutes
        const msPerMinute = 1000 * 60;
        const msPerHour = msPerMinute * 60;
        const msPerDay = msPerHour * 24;
        const msPerWeek = msPerDay * 7;
        const msPerMonth = msPerDay * 30.44; // Average number of days in a month
        const msPerYear = msPerDay * 365.25; // Average number of days in a year (accounting for leap years)
        const years = Math.floor(diffMs / msPerYear);
        const months = Math.floor((diffMs % msPerYear) / msPerMonth);
        const weeks = Math.floor((diffMs % msPerMonth) / msPerWeek);
        const days = Math.floor((diffMs % msPerWeek) / msPerDay);
        const hours = Math.floor((diffMs % msPerDay) / msPerHour);
        const minutes = Math.floor((diffMs % msPerHour) / msPerMinute);
    
        return { years, months, weeks, days, hours, minutes };

    }
// retroactively calculate the time since a given date using the isoDatetime
    export function formattedTimeSinceDate(isoDateString: string): string {

      const { years, months, weeks, days, hours, minutes } =  isoTimeSinceDate(isoDateString);
      let timeSince = "";

      if (years > 0) {
        timeSince += `${years} year${years > 1 ? "s" : ""}, `;
      }
      if (months > 0) {
        timeSince += `${months} month${months > 1 ? "s" : ""}, `;
      }
      if (weeks > 0) {
        timeSince += `${weeks} week${weeks > 1 ? "s" : ""}, `;
      }
      if (days > 0) {
        timeSince += `${days} day${days > 1 ? "s" : ""}, `;
      }
      if (hours > 0) {
        timeSince += `${hours} hour${hours > 1 ? "s" : ""}, `;
      }
      if (minutes > 0) {
        timeSince += `${minutes} minute${minutes > 1 ? "s" : ""}`;
      }

      return timeSince;
    }

