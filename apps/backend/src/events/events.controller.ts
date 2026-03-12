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
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AuthGuard } from '@nestjs/passport';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  // eslint-disable-next-line prettier/prettier
  constructor(private readonly eventsService: EventsService) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201, description: 'Event created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or date in the past.',
  })
  async create(
    @Body() createEventDto: CreateEventDto,
    @GetUser('id') userId: string,
  ) {
    return await this.eventsService.create(createEventDto, userId);
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get all public events' })
  @ApiResponse({ status: 200, description: 'Return list of public events.' })
  async findAll(@GetUser('id') userId?: string) {
    return await this.eventsService.findAll(userId);
  }

  @Get('me/calendar')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user calendar' })
  async getMyCalendar(@GetUser('id') userId: string) {
    return await this.eventsService.findMyCalendar(userId);
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get event details by ID' })
  async findOne(@Param('id') id: string, @GetUser('id') userId?: string) {
    return await this.eventsService.findOne(id, userId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Update an event' })
  @ApiResponse({ status: 200, description: 'Event updated successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: You are not the author.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @GetUser('id') userId: string,
  ) {
    return await this.eventsService.update(id, userId, updateEventDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Delete an event' })
  async remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.eventsService.remove(id, userId);
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Join an event' })
  @ApiResponse({ status: 200, description: 'Successfully joined.' })
  @ApiResponse({ status: 400, description: 'Event is full or already joined.' })
  async join(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.eventsService.joinEvent(id, userId);
  }

  @Post(':id/leave')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Leave an event' })
  async leave(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.eventsService.leaveEvent(id, userId);
  }
}
