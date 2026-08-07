export class CopyIncompleteDto {
  /** Target day (defaults to today). */
  date?: string;
  /** Source log date (defaults to latest sealed log). */
  sourceDate?: string;
}
