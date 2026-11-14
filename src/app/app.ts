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
  readonly serviceDateOptions = this.getServiceDates();
  readonly money = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount || 0);

  customerDate = '';
  customerDay: ServiceDay | null = null;
  menuItems: MenuItem[] = [];
  quantities: Record<string, number> = {};
  loadingMenu = true;
  menuError = '';
  checkoutError = '';
  placingOrder = false;
  confirmationCode = '';
  confirmationItems: MenuItem[] = [];
  confirmationTotal = 0;

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
      this.customerDay?.ordering_open && this.menuItems.length > 0 && this.remaining > 0,
    );
  }

  get availabilityText(): string {
    if (!this.customerDay) return 'Not yet open';
    if (!this.customerDay.ordering_open) return 'Ordering closed';
    if (this.menuItems.length === 0) return 'Menu not published';
    return this.remaining === 1 ? '1 plate available' : `${this.remaining} plates available`;
  }

  get currentMenuDateLabel(): string {
    return this.customerDate ? this.prettyDate(this.customerDate) : 'Loading menu';
  }

  get closedMessage(): string {
    if (this.remaining === 0) {
      return "Looks like today's plates are all taken! ❤️\n\nWe've reached our daily limit for today. Thank you for the wonderful response and for supporting The Plates.\n\nWe'd love to serve you again tomorrow!";
    }
    return 'Ordering is not open for this service date yet. Please check back when the menu is published.';
  }

  async loadCustomer(date?: string): Promise<void> {
    const selectedDate = date ?? (this.customerDate || this.serviceDateOptions[0].value);
    this.customerDate = selectedDate;
    this.loadingMenu = true;
    this.menuError = '';
    try {
      if (DEMO) {
        this.customerDay = this.demoDay(selectedDate);
        this.menuItems = this.demoItems(selectedDate);
      } else {
        const client = await getSupabaseClient();
        const [dayResult, menuResult] = await Promise.all([
          client.from('service_days').select('*').eq('service_date', selectedDate).maybeSingle(),
          client
            .from('menu_items')
            .select('*')
            .eq('service_date', selectedDate)
            .eq('enabled', true)
            .order('created_at'),
        ]);
        if (dayResult.error) throw dayResult.error;
        if (menuResult.error) throw menuResult.error;
        this.customerDay = dayResult.data;
        this.menuItems = menuResult.data ?? [];
      }
      this.quantities = {};
    } catch (error) {
      console.error(error);
      this.menuError = 'We couldn’t load the menu just now. Please try again shortly.';
      this.customerDay = null;
      this.menuItems = [];
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

  paymentInstructions(): string {
    return `Please complete your payment of ${this.money(this.confirmationTotal)} to 9207285657 via Google Pay or any other UPI app. Please use ${this.confirmationCode} as the payment note.`;
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

  async addMenuItem(): Promise<void> {
    if (this.adminItems.length > 0) return;
    const item = {
      service_date: this.adminDate,
      name: "Today's dish",
      description: 'Add a short description',
      price: 100,
      enabled: true,
    };
    try {
      if (DEMO) {
        this.adminItems = [{ ...item, id: `demo-${Date.now()}` }];
      } else {
        const client = await getSupabaseClient();
        const { data, error } = await client.from('menu_items').insert(item).select().single();
        if (error) throw error;
        this.adminItems = [data];
      }
    } catch (error) {
      console.error(error);
      this.adminError = error instanceof Error ? error.message : 'Could not add the menu item.';
    }
    this.changeDetector.markForCheck();
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
    const parsed = new Date(year, month - 1, day, 12);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day ||
      ![2, 3, 4].includes(parsed.getDay())
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
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    while (dates.length < count) {
      if ([2, 3, 4].includes(date.getDay())) dates.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return dates.map((item) => {
      const value = this.localDate(item);
      return { value, label: this.prettyDate(value) };
    });
  }

  private localDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
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
