import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, AfterViewChecked, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ChatService, GraphNode, GraphEdge } from './chat';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, ReactiveFormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewChecked {
  chatService = inject(ChatService);
  chatForm: FormGroup;
  showSidebar = signal(false);

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef;

  constructor() {
    const fb = inject(FormBuilder);
    this.chatForm = fb.group({
      message: ['']
    });
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  toggleSidebar() {
    this.showSidebar.update(v => !v);
  }

  onSubmit() {
    if (this.chatForm.valid && !this.chatService.isLoading()) {
      const msg = this.chatForm.value.message;
      if (msg) {
        this.chatService.sendMessage(msg);
        this.chatForm.reset();
      }
    }
  }

  parseMarkdown(content: string): string {
    const rawHtml = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rawHtml);
  }

  private scrollToBottom(): void {
    if (this.scrollContainer) {
      try {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      } catch (err) {
        console.error('Scroll error', err);
      }
    }
  }

  getEdgesForNode(nodeId: string, edges: GraphEdge[]): GraphEdge[] {
    return edges.filter(e => e.sourceId === nodeId);
  }

  getNodeName(nodeId: string, nodes: GraphNode[]): string {
    const node = nodes.find(n => n.id === nodeId);
    return node ? node.name : nodeId;
  }
}
