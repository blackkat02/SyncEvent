import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AuthGuard } from '@nestjs/passport';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@Controller('events')
export class EventsController {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly eventsService: EventsService) { }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  create(
    @Body() createEventDto: CreateEventDto,
    @GetUser('id') userId: string,
  ) {
    return this.eventsService.create(createEventDto, userId);
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  findAll(@GetUser('id') userId?: string) {
    return this.eventsService.findAll(userId);
  }

  @Get('me/calendar')
  @UseGuards(AuthGuard('jwt'))
  getMyCalendar(@GetUser('id') userId: string) {
    return this.eventsService.findMyCalendar(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @GetUser('id') userId: string,
  ) {
    return this.eventsService.update(id, userId, updateEventDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.eventsService.remove(id, userId);
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  join(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.eventsService.joinEvent(id, userId);
  }

  @Post(':id/leave')
  @UseGuards(AuthGuard('jwt'))
  leave(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.eventsService.leaveEvent(id, userId);
  }
}
