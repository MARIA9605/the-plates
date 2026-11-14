import { DatePipe } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wajkorqqxljlrijqucqr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HPtW52lbGZH00ujKYLpF1w_BrkEPHGR';
const ADMIN_USERNAME = 'Theplate2026';
const ADMIN_AUTH_EMAIL = 'mariageorgemoonjely@gmail.com';
const DEMO = SUPABASE_URL.includes('YOUR_PROJECT');
let supabaseClientPromise: Promise<SupabaseClient> | undefined;

function getSupabaseClient(): Promise<SupabaseClient> {
  supabaseClientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY),
  );
  return supabaseClientPromise;
}

interface ServiceDay {
  service_date: string;
  capacity: number;
  booked_meals: number;
  ordering_open: boolean;
}

interface MenuItem {
  id: string;
  service_date: string;
  name: string;
  description: string;
  price: number;
  enabled: boolean;
  quantity?: number;
}

interface OrderItem {
  id?: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

interface Order {
  id: string;
  order_code: string;
  service_date: string;
  customer_name: string;
  phone: string;
  delivery_address: string | null;
  total_quantity: number;
  total_amount: number;
  payment_status: 'pending' | 'paid';
  order_status: 'accepted' | 'cancelled';
  created_at: string;
  order_items: OrderItem[];
}

interface WeeklyMenuDay {
  service_date: string;
  label: string;
  day: ServiceDay | null;
  items: MenuItem[];
}

export function serviceDayDeadline(serviceDate: string): Date {
  const dayBefore = new Date(`${serviceDate}T00:00:00.000Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  return new Date(`${dayBefore.toISOString().slice(0, 10)}T21:00:00+05:30`);
}

export function canOrderForServiceDay(serviceDate: string, now = new Date()): boolean {
  return now.getTime() < serviceDayDeadline(serviceDate).getTime();
}

@Component({
  imports: [DatePipe, FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App implements OnInit {
  @ViewChild('checkoutDialog') private checkoutDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('confirmationDialog') private confirmationDialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('adminDialog') private adminDialog!: ElementRef<HTMLDialogElement>;

  readonly demo = DEMO;
  readonly Math = Math;
  readonly paymentPhone = '9207285657';
  readonly serviceDateOptions = this.getServiceDates();
  readonly weekServiceDates = this.getMenuWeekDates();
  readonly money = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);

  customerDate = '';
  customerDay: ServiceDay | null = null;
  weeklyMenu: WeeklyMenuDay[] = [];
  menuItems: MenuItem[] = [];
  quantities: Record<string, number> = {};
  loadingMenu = true;
  menuError = '';
  checkoutError = '';
  placingOrder = false;
  confirmationCode = '';
  confirmationItems: MenuItem[] = [];
  confirmationTotal = 0;
  copyPaymentPhoneMessage = '';
  cancelOrderCode = '';
  cancelPhone = '';
  cancellationMessage = '';
  cancellationError = false;
  cancellingOrder = false;

  adminView = false;
  adminPreview = false;
  adminTab: 'schedule' | 'orders' = 'schedule';
  adminDate = '';
  ordersDate = '';
  paymentFilter = '';
  adminDay: ServiceDay | null = null;
  adminItems: MenuItem[] = [];
  orders: Order[] = [];
  adminError = '';
  capacityValue = 5;
  orderingOpen = false;
  savingCapacity = false;
  savingItemId = '';
  loginError = '';
  loginBusy = false;

  constructor(private readonly changeDetector: ChangeDetectorRef) {
    this.adminDate = this.serviceDateOptions[0].value;
    this.ordersDate = this.serviceDateOptions[0].value;
  }

  ngOnInit(): void {
    void this.loadCustomer();
  }

  get remaining(): number {
    return Math.max(0, (this.customerDay?.capacity ?? 0) - (this.customerDay?.booked_meals ?? 0));
  }

  get totalSelected(): number {
    return this.selectedItems.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  }

  get orderTotal(): number {
    return this.selectedItems.reduce((sum, item) => sum + (item.quantity ?? 0) * item.price, 0);
  }

  get selectedItems(): MenuItem[] {
    return this.menuItems
      .map((item) => ({ ...item, quantity: this.quantities[item.id] ?? 0 }))
      .filter((item) => (item.quantity ?? 0) > 0);
  }

  get orderingAvailable(): boolean {
    return Boolean(
      this.customerDay?.ordering_open &&
      this.menuItems.length > 0 &&
      this.remaining > 0 &&
      canOrderForServiceDay(this.customerDate),
    );
  }

  get availabilityText(): string {
    if (!this.customerDate) return 'No day selected';
    if (!this.customerDay) return 'Not yet open';
    if (!this.customerDay.ordering_open) return 'Ordering closed';
    if (this.menuItems.length === 0) return 'Menu not published';
    if (!canOrderForServiceDay(this.customerDate)) return 'Orders closed';
    return this.remaining === 1 ? '1 plate available' : `${this.remaining} plates available`;
  }

  get currentMenuDateLabel(): string {
    return this.customerDate ? this.prettyDate(this.customerDate) : 'Choose a service date';
  }

  get closedMessage(): string {
    if (!canOrderForServiceDay(this.customerDate)) {
      return `Ordering closed at 9:00 PM on ${this.prettyDate(this.dayBefore(this.customerDate))}.`;
    }
    if (this.remaining === 0) {
      return "Looks like today's plates are all taken! ❤️\n\nWe've reached our daily limit for today. Thank you for the wonderful response and for supporting The Plates.\n\nWe'd love to serve you again tomorrow!";
    }
    return 'Ordering is not open for this service date yet. Please check back when the menu is published.';
  }

  serviceDayStatus(entry: WeeklyMenuDay): string {
    if (!entry.day || entry.items.length === 0) return 'Menu not published';
    if (!entry.day.ordering_open) return 'Not yet open';
    if (!canOrderForServiceDay(entry.service_date)) return 'Orders closed';
    if (entry.day.capacity <= entry.day.booked_meals) return 'Sold out';
    return 'Available to order';
  }

  selectServiceDay(date: string): void {
    const entry = this.weeklyMenu.find((item) => item.service_date === date);
    if (!entry) return;
    this.customerDate = entry.service_date;
    this.customerDay = entry.day;
    this.menuItems = entry.items;
    this.quantities = {};
    this.menuError = '';
    this.changeDetector.markForCheck();
  }

  async loadCustomer(date?: string): Promise<void> {
    const weekDates = this.weekServiceDates.map((item) => item.value);
    const preferredDate = date ?? this.customerDate;
    this.customerDate = preferredDate;
    this.loadingMenu = true;
    this.menuError = '';
    try {
      if (DEMO) {
        this.weeklyMenu = this.weekServiceDates.map((item) => ({
          service_date: item.value,
          label: item.label,
          day: this.demoDay(item.value),
          items: this.demoItems(item.value),
        }));
      } else {
        const client = await getSupabaseClient();
        const [daysResult, menuResult] = await Promise.all([
          client
            .from('service_days')
            .select('*')
            .in('service_date', weekDates)
            .order('service_date'),
          client
            .from('menu_items')
            .select('*')
            .in('service_date', weekDates)
            .eq('enabled', true)
            .order('created_at'),
        ]);
        if (daysResult.error) throw daysResult.error;
        if (menuResult.error) throw menuResult.error;
        const daysByDate = new Map(
          (daysResult.data ?? []).map((day) => [day.service_date, day as ServiceDay]),
        );
        const itemsByDate = new Map<string, MenuItem[]>();
        for (const item of menuResult.data ?? []) {
          const dateItems = itemsByDate.get(item.service_date) ?? [];
          dateItems.push(item);
          itemsByDate.set(item.service_date, dateItems);
        }
        this.weeklyMenu = this.weekServiceDates.map((item) => ({
          service_date: item.value,
          label: item.label,
          day: daysByDate.get(item.value) ?? null,
          items: itemsByDate.get(item.value) ?? [],
        }));
      }
      const selected = preferredDate
        ? this.weeklyMenu.find((item) => item.service_date === preferredDate)
        : undefined;
      this.customerDate = selected?.service_date ?? '';
      this.customerDay = selected?.day ?? null;
      this.menuItems = selected?.items ?? [];
      this.quantities = {};
    } catch (error) {
      console.error(error);
      this.menuError = 'We couldn’t load the menu just now. Please try again shortly.';
      this.customerDay = null;
      this.menuItems = [];
      this.weeklyMenu = [];
    } finally {
      this.loadingMenu = false;
      this.changeDetector.markForCheck();
    }
  }

  adjustQuantity(itemId: string, amount: number): void {
    const current = this.quantities[itemId] ?? 0;
    if (amount > 0 && this.totalSelected >= this.remaining) return;
    this.quantities[itemId] = Math.max(0, current + amount);
  }

  openCheckout(): void {
    this.checkoutError = '';
    this.checkoutDialog.nativeElement.showModal();
  }

  async placeOrder(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const quantity = this.totalSelected;
    this.checkoutError = '';

    if (quantity === 0) {
      this.checkoutError = 'Choose at least one plate before placing your order.';
      return;
    }
    if (quantity > this.remaining) {
      this.checkoutError = `Only ${this.remaining} ${this.remaining === 1 ? 'plate is' : 'plates are'} remaining for today. Please adjust your quantity to continue.`;
      return;
    }

    this.placingOrder = true;
    try {
      let orderCode: string;
      let total: number;
      if (DEMO) {
        orderCode = 'TP-DEMO-01';
        total = this.orderTotal;
        this.customerDay!.booked_meals += quantity;
      } else {
        const client = await getSupabaseClient();
        const result = await client.rpc('place_meal_order', {
          p_service_date: this.customerDate,
          p_customer_name: String(data.get('customer_name') ?? ''),
          p_phone: String(data.get('phone') ?? ''),
          p_delivery_address: String(data.get('delivery_address') ?? '') || null,
          p_items: this.selectedItems.map((item) => ({
            menu_item_id: item.id,
            quantity: item.quantity,
          })),
        });
        if (result.error) throw result.error;
        const response = result.data as { order_code?: unknown; total_amount?: unknown } | null;
        if (
          !response ||
          typeof response.order_code !== 'string' ||
          typeof response.total_amount !== 'number'
        ) {
          throw new Error('The server returned an invalid order confirmation.');
        }
        orderCode = response.order_code;
        total = response.total_amount;
      }

      this.confirmationCode = orderCode;
      this.confirmationTotal = total;
      this.confirmationItems = this.selectedItems;
      this.checkoutDialog.nativeElement.close();
      form.reset();
      this.confirmationDialog.nativeElement.showModal();
      if (DEMO) {
        this.quantities = {};
      } else {
        await this.loadCustomer(this.customerDate);
      }
    } catch (error) {
      console.error(error);
      this.checkoutError =
        error instanceof Error
          ? error.message
          : 'We couldn’t reserve those plates. Please try again.';
      if (!DEMO) await this.loadCustomer(this.customerDate);
    } finally {
      this.placingOrder = false;
      this.changeDetector.markForCheck();
    }
  }

  async requestCancellation(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.cancellationMessage = '';
    this.cancellationError = false;
    this.cancellingOrder = true;
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client.rpc('cancel_customer_order', {
        p_order_code: this.cancelOrderCode.trim(),
        p_phone: this.cancelPhone.trim(),
      });
      if (error) throw error;
      const response = data as { message?: unknown } | null;
      this.cancellationMessage =
        typeof response?.message === 'string'
          ? response.message
          : 'Your order has been cancelled and the plates released.';
      await this.loadCustomer(this.customerDate);
    } catch (error) {
      console.error(error);
      this.cancellationError = true;
      this.cancellationMessage =
        error instanceof Error ? error.message : 'Could not cancel this order. Please try again.';
    } finally {
      this.cancellingOrder = false;
      this.changeDetector.markForCheck();
    }
  }

  async copyPaymentPhone(): Promise<void> {
    this.copyPaymentPhoneMessage = '';
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is not available in this browser.');
      }
      await navigator.clipboard.writeText(this.paymentPhone);
      this.copyPaymentPhoneMessage = 'Payment number copied.';
    } catch (error) {
      console.error(error);
      this.copyPaymentPhoneMessage = 'Could not copy the number. Please copy it manually.';
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  async openAdmin(): Promise<void> {
    this.loginError = '';
    this.adminView = false;
    this.adminPreview = DEMO;
    this.adminDialog.nativeElement.showModal();
    if (DEMO) return;
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      this.loginError = error.message;
      this.changeDetector.markForCheck();
      return;
    }
    if (data.session) await this.showAdminDashboard();
  }

  async login(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    if (values.get('username') !== ADMIN_USERNAME) {
      this.loginError = 'That username is not authorized.';
      return;
    }
    if (ADMIN_AUTH_EMAIL.startsWith('REPLACE_')) {
      this.loginError = 'Finish the Supabase admin setup before signing in.';
      return;
    }
    this.loginBusy = true;
    this.loginError = '';
    try {
      const client = await getSupabaseClient();
      const { error } = await client.auth.signInWithPassword({
        email: ADMIN_AUTH_EMAIL,
        password: String(values.get('password') ?? ''),
      });
      if (error) throw error;
      form.reset();
      await this.showAdminDashboard();
    } catch (error) {
      console.error(error);
      this.loginError = 'Incorrect username or password.';
    } finally {
      this.loginBusy = false;
      this.changeDetector.markForCheck();
    }
  }

  async showAdminDashboard(): Promise<void> {
    this.adminView = true;
    this.adminPreview = false;
    this.changeDetector.markForCheck();
    await Promise.all([this.loadAdminDay(this.adminDate), this.loadOrders()]);
  }

  async loadAdminDay(date: string): Promise<void> {
    this.adminDate = date;
    this.adminError = '';
    try {
      if (DEMO) {
        this.adminDay = this.demoDay(date);
        this.adminItems = this.demoItems(date);
      } else {
        const client = await getSupabaseClient();
        const [dayResult, menuResult] = await Promise.all([
          client.from('service_days').select('*').eq('service_date', date).maybeSingle(),
          client.from('menu_items').select('*').eq('service_date', date).order('created_at'),
        ]);
        if (dayResult.error) throw dayResult.error;
        if (menuResult.error) throw menuResult.error;
        this.adminDay = dayResult.data ?? {
          service_date: date,
          capacity: 5,
          booked_meals: 0,
          ordering_open: false,
        };
        this.adminItems = menuResult.data ?? [];
      }
      if (this.adminDay) {
        this.capacityValue = this.adminDay.capacity;
        this.orderingOpen = this.adminDay.ordering_open;
      }
    } catch (error) {
      console.error(error);
      this.adminError = 'Could not load this date. Please try again.';
    }
    this.changeDetector.markForCheck();
  }

  async saveCapacity(): Promise<void> {
    if (!this.adminDay) return;
    const booked = this.adminDay.booked_meals;
    if (this.capacityValue < booked) {
      this.adminError = `Capacity cannot be lower than ${booked}, the number of plates already booked.`;
      return;
    }
    const values = {
      service_date: this.adminDate,
      capacity: this.capacityValue,
      ordering_open: this.orderingOpen,
    };
    this.adminError = '';
    this.savingCapacity = true;
    try {
      if (!DEMO) {
        const client = await getSupabaseClient();
        const { error } = await client.from('service_days').upsert(values);
        if (error) throw error;
      }
      this.adminDay = { ...this.adminDay, ...values };
      if (this.customerDate === this.adminDate) await this.loadCustomer(this.customerDate);
    } catch (error) {
      console.error(error);
      this.adminError = error instanceof Error ? error.message : 'Could not save date settings.';
    } finally {
      this.savingCapacity = false;
      this.changeDetector.markForCheck();
    }
  }

  async addMenuItem(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.adminItems.length > 0) return;
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const name = String(values.get('name') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const price = Number(values.get('price'));
    if (!name || !Number.isFinite(price) || price < 1) {
      this.adminError = 'Enter a dish name and a valid price.';
      this.changeDetector.markForCheck();
      return;
    }

    const item = {
      service_date: this.adminDate,
      name,
      description,
      price,
      enabled: true,
    };
    this.savingItemId = 'new';
    this.adminError = '';
    try {
      if (DEMO) {
        this.adminItems = [{ ...item, id: `demo-${Date.now()}` }];
      } else {
        const client = await getSupabaseClient();
        const dayValues = {
          service_date: this.adminDate,
          capacity: this.adminDay?.capacity ?? this.capacityValue,
          ordering_open: this.adminDay?.ordering_open ?? this.orderingOpen,
        };
        const { error: dayError } = await client.from('service_days').upsert(dayValues);
        if (dayError) throw dayError;
        const { data, error } = await client.from('menu_items').insert(item).select().single();
        if (error) throw error;
        this.adminItems = [data];
        this.adminDay = {
          ...this.adminDay,
          ...dayValues,
          booked_meals: this.adminDay?.booked_meals ?? 0,
        };
      }
      form.reset();
    } catch (error) {
      console.error(error);
      this.adminError = error instanceof Error ? error.message : 'Could not add the menu item.';
    } finally {
      this.savingItemId = '';
      this.changeDetector.markForCheck();
    }
  }

  async saveMenuItem(item: MenuItem): Promise<void> {
    this.savingItemId = item.id;
    this.adminError = '';
    try {
      if (!DEMO) {
        const client = await getSupabaseClient();
        const { error } = await client
          .from('menu_items')
          .update({
            name: item.name,
            description: item.description,
            price: item.price,
            enabled: item.enabled,
          })
          .eq('id', item.id);
        if (error) throw error;
      }
      if (this.customerDate === this.adminDate) await this.loadCustomer(this.customerDate);
    } catch (error) {
      console.error(error);
      this.adminError = error instanceof Error ? error.message : 'Could not save the menu item.';
    } finally {
      this.savingItemId = '';
      this.changeDetector.markForCheck();
    }
  }

  async loadOrders(): Promise<void> {
    if (DEMO) {
      this.orders = [];
      return;
    }
    const client = await getSupabaseClient();
    let query = client
      .from('orders')
      .select('*, order_items(*)')
      .eq('service_date', this.ordersDate)
      .order('created_at', { ascending: false });
    if (this.paymentFilter) query = query.eq('payment_status', this.paymentFilter);
    const { data, error } = await query;
    if (error) {
      console.error(error);
      this.adminError = error.message;
      this.changeDetector.markForCheck();
      return;
    }
    this.orders = data ?? [];
    this.changeDetector.markForCheck();
  }

  async updatePayment(order: Order, event: Event): Promise<void> {
    const status = (event.target as HTMLSelectElement).value as Order['payment_status'];
    if (DEMO) {
      order.payment_status = status;
      return;
    }
    const client = await getSupabaseClient();
    const { error } = await client
      .from('orders')
      .update({ payment_status: status })
      .eq('id', order.id);
    if (error) {
      console.error(error);
      this.adminError = error.message;
      this.changeDetector.markForCheck();
      return;
    }
    await this.loadOrders();
  }

  async cancelOrder(order: Order): Promise<void> {
    if (!window.confirm('Cancel this order and release its plates back to today’s capacity?'))
      return;
    if (DEMO) {
      order.order_status = 'cancelled';
      return;
    }
    const client = await getSupabaseClient();
    const { error } = await client.rpc('cancel_order_and_release', { p_order_id: order.id });
    if (error) {
      console.error(error);
      this.adminError = error.message;
      this.changeDetector.markForCheck();
      return;
    }
    await this.loadOrders();
    if (this.adminDate === this.customerDate) await this.loadCustomer(this.customerDate);
    await this.loadAdminDay(this.adminDate);
  }

  async exportCsv(): Promise<void> {
    if (DEMO) {
      window.alert('CSV export is available after connecting Supabase.');
      return;
    }
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from('orders')
      .select('*, order_items(*)')
      .eq('service_date', this.ordersDate);
    if (error) {
      console.error(error);
      this.adminError = error.message;
      this.changeDetector.markForCheck();
      return;
    }
    const headers = [
      'Order ID',
      'Name',
      'Phone',
      'Address',
      'Items',
      'Plates',
      'Total',
      'Payment',
      'Order status',
      'Created at',
    ];
    const rows = (data ?? []).map((order) =>
      [
        order.order_code,
        order.customer_name,
        order.phone,
        order.delivery_address ?? '',
        order.order_items
          .map((item: OrderItem) => `${item.quantity}x ${item.item_name}`)
          .join('; '),
        order.total_quantity,
        order.total_amount,
        order.payment_status,
        order.order_status,
        order.created_at,
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    );
    const url = URL.createObjectURL(
      new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `the-plates-${this.ordersDate}-orders.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async signOut(): Promise<void> {
    if (!DEMO) {
      const client = await getSupabaseClient();
      const { error } = await client.auth.signOut();
      if (error) {
        this.adminError = error.message;
        this.changeDetector.markForCheck();
        return;
      }
    }
    this.adminView = false;
    this.adminPreview = false;
    this.changeDetector.markForCheck();
  }

  addServiceDate(): void {
    const date = window.prompt('Service date (YYYY-MM-DD). Tuesday, Wednesday or Thursday only:');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const [year, month, day] = date.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day ||
      ![2, 3, 4].includes(parsed.getUTCDay())
    ) {
      this.adminError = 'Choose a valid Tuesday, Wednesday, or Thursday.';
      return;
    }
    if (!this.serviceDateOptions.some((option) => option.value === date)) {
      this.serviceDateOptions.push({ value: date, label: this.prettyDate(date) });
      this.serviceDateOptions.sort((a, b) => a.value.localeCompare(b.value));
    }
    this.adminDate = date;
    void this.loadAdminDay(date);
  }

  private getServiceDates(count = 9): { value: string; label: string }[] {
    const dates: Date[] = [];
    const today = this.todayInIndia();
    const date = new Date(today);
    while (dates.length < count) {
      if ([2, 3, 4].includes(date.getUTCDay())) dates.push(new Date(date));
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return dates.map((item) => {
      const value = item.toISOString().slice(0, 10);
      return { value, label: this.prettyDate(value) };
    });
  }

  private getMenuWeekDates(): { value: string; label: string }[] {
    const today = this.todayInIndia();
    const weekday = today.getUTCDay();
    const monday = new Date(today);
    monday.setUTCDate(monday.getUTCDate() - ((weekday + 6) % 7));
    const tuesday = new Date(monday);
    tuesday.setUTCDate(tuesday.getUTCDate() + 1);
    if ([0, 5, 6].includes(weekday)) tuesday.setUTCDate(tuesday.getUTCDate() + 7);
    return [0, 1, 2].map((offset) => {
      const date = new Date(tuesday);
      date.setUTCDate(date.getUTCDate() + offset);
      const value = date.toISOString().slice(0, 10);
      return { value, label: this.prettyDate(value) };
    });
  }

  private todayInIndia(): Date {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    return new Date(`${date}T00:00:00.000Z`);
  }

  private dayBefore(serviceDate: string): string {
    const date = new Date(`${serviceDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  private prettyDate(date: string): string {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(`${date}T12:00:00`));
  }

  private demoDay(date: string): ServiceDay {
    return { service_date: date, capacity: 5, booked_meals: 0, ordering_open: true };
  }

  private demoItems(date: string): MenuItem[] {
    return [
      {
        id: 'biriyani',
        service_date: date,
        name: 'Chicken Biriyani',
        description: 'Fragrant basmati rice, tender chicken and our house masala',
        price: 140,
        enabled: true,
      },
    ];
  }
}
