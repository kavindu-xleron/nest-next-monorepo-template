import { Injectable } from "@nestjs/common"

@Injectable()
export class HealthService {
  private isDrainingState = false

  markDraining(): void {
    this.isDrainingState = true
  }

  isDraining(): boolean {
    return this.isDrainingState
  }
}
