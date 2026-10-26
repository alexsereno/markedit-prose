/** Results belong to one exact editor snapshot, never a later edit. */
export class Revision {
  private current = 0;
  next(): number {
    return ++this.current;
  }
  accepts(id: number): boolean {
    return id === this.current;
  }
}
