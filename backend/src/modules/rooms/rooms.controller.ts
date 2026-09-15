import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { QueryRoomsDto } from './dto/query-rooms.dto';

/** Public catalogue — browsing rooms does not require a login. */
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  find(@Query() query: QueryRoomsDto) {
    return this.rooms.search(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.getOrFail(id);
  }
}
