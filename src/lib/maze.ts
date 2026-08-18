export class Maze {
  dim: number;
  optimalDist: number;
  chests: any[];
  orbs: any[];
  grid: number[][];

  constructor(dim: number) {
    this.dim = dim;
    this.optimalDist = 0;
    this.chests = [];
    this.orbs = [];
    this.grid = Array.from({ length: dim }, () => Array(dim).fill(1));
    let attempts = 0, isValid = false, bestExit: any = null, bestGrid: any = null;

    while (!isValid && attempts < 200) {
      attempts++;
      this.grid = Array.from({ length: dim }, () => Array(dim).fill(1));
      this.gen(1, 1);

      let exitParams = this.findHardestExit();
      if (!bestExit || (exitParams.d + exitParams.turns > bestExit.d + bestExit.turns)) {
        bestExit = exitParams;
        bestGrid = this.grid.map(row => [...row]);
      }
      if (exitParams.d >= 20 && exitParams.turns >= 5) { isValid = true; }
    }

    this.grid = bestGrid;
    this.grid[bestExit.y][bestExit.x] = 2;
    this.optimalDist = bestExit.d;

    for (let y = 1; y < dim - 1; y++) {
      for (let x = 1; x < dim - 1; x++) {
        if (this.grid[y][x] === 0 && (x !== 1 || y !== 1)) {
          let walls = 0;
          if (this.grid[y + 1][x] === 1) walls++;
          if (this.grid[y - 1][x] === 1) walls++;
          if (this.grid[y][x + 1] === 1) walls++;
          if (this.grid[y][x - 1] === 1) walls++;

          if (walls >= 3) {
            this.chests.push({
              x: x + 0.5,
              y: y + 0.5,
              isMimic: Math.random() > 0.5,
              state: 'closed',
              scanProgress: 0,
              isTargeted: false
            });
          } else if (Math.random() < 0.15) {
            // 15% chance to spawn an energy orb in empty corridors
            this.orbs.push({
              x: x + 0.5,
              y: y + 0.5,
              collected: false,
              isTargeted: false
            });
          }
        }
      }
    }
  }

  gen(x: number, y: number) {
    this.grid[y][x] = 0;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5).forEach(([dx, dy]) => {
      let nx = x + dx * 2, ny = y + dy * 2;
      if (nx > 0 && nx < this.dim - 1 && ny > 0 && ny < this.dim - 1 && this.grid[ny][nx] === 1) {
        this.grid[y + dy][x + dx] = 0; this.gen(nx, ny);
      }
    });
  }

  findHardestExit() {
    let q = [{ x: 1, y: 1, d: 0, dx: 0, dy: 0, turns: 0 }];
    let visited = Array.from({ length: this.dim }, () => Array(this.dim).fill(false));
    visited[1][1] = true;
    let best = { x: 1, y: 1, d: 0, turns: 0 }, maxScore = 0;

    while (q.length > 0) {
      let curr = q.shift()!;
      let score = curr.d + curr.turns * 3;
      if (score > maxScore && (curr.x !== 1 || curr.y !== 1)) {
        maxScore = score; best = curr;
      }

      [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
        let nx = curr.x + dx, ny = curr.y + dy;
        if (nx > 0 && nx < this.dim - 1 && ny > 0 && ny < this.dim - 1) {
          if (!visited[ny][nx] && this.grid[ny][nx] === 0) {
            visited[ny][nx] = true;
            let isTurn = (curr.dx !== 0 || curr.dy !== 0) && (curr.dx !== dx || curr.dy !== dy);
            q.push({ x: nx, y: ny, d: curr.d + 1, dx: dx, dy: dy, turns: curr.turns + (isTurn ? 1 : 0) });
          }
        }
      });
    }
    return best;
  }
}
