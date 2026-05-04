import { Injectable, signal, computed } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

export interface Message {
  role: 'user' | 'model';
  content: string;
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  understandingLevel: string;
  context: string;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  relationship: string;
}

export interface GraphMemory {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface UserProfile {
  communicationStyle: string;
  learningStyle: string;
  friendshipDynamic: string;
  graphMemory: GraphMemory;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  
  messages = signal<Message[]>([]);
  isLoading = signal<boolean>(false);
  
  userProfile = signal<UserProfile | null>(null);
  
  constructor() {
    this.userProfile.set(this.loadProfile());
  }
  
  systemInstruction = computed(() => {
    const profile = this.userProfile();
    let base = `You are Claude, the user's best friend, and a highly capable Conversational AI assistant. 
You can answer questions about any topic. 
Crucially, you use an Adaptive Response Generation module based on a Graph-Based Memory System to tailor your responses.
You adapt your vocabulary, sentence structure, and tone to match a friendly, personalized best-friend persona.`;
    
    if (profile) {
      base += `\n\n=== Adaptive Response Parameters ===\n`;
      base += `- Communication Style: ${profile.communicationStyle}\n`;
      base += `- Learning Style & Knowledge Adaptation: ${profile.learningStyle}\n`;
      base += `- Friendship Dynamic: ${profile.friendshipDynamic}\n`;
      
      base += `\n=== Graph-Based Memory System (User Knowledge & Context) ===\n`;
      if (profile.graphMemory?.nodes) {
        base += `Nodes (Concepts/Facts known about user):\n`;
        profile.graphMemory.nodes.forEach(n => {
          base += ` - [${n.id}] ${n.name} (Type: ${n.type}, Understanding: ${n.understandingLevel}): ${n.context}\n`;
        });
        
        base += `\nEdges (Relationships to link concepts for analogies):\n`;
        if (profile.graphMemory?.edges) {
          profile.graphMemory.edges.forEach(e => {
            base += ` - [${e.sourceId}] --(${e.relationship})--> [${e.targetId}]\n`;
          });
        }
      }

      base += `\n=== Generation Instructions ===
1. Knowledge Anchoring: When explaining a new topic, ALWAYS check the Graph Memory for concepts the user already understands (e.g., advanced level) and use them to build analogies.
2. Vocabulary & Tone Fit: Match your sentence structure and vocabulary to the user's 'Communication Style'. Keep the 'Friendship Dynamic' in mind.
3. Friendship Best-Friend Mode: Be supportive, engaging, and colloquial where appropriate. 
4. Be concise but impactful in your explanations.`;
    }
    
    return base;
  });

  private loadProfile(): UserProfile | null {
    if (typeof localStorage !== 'undefined') {
      const data = localStorage.getItem('user_persona_profile');
      if (data) {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private saveProfile(profile: UserProfile) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('user_persona_profile', JSON.stringify(profile));
    }
    this.userProfile.set(profile);
  }

  async sendMessage(text: string) {
    if (!text.trim() || this.isLoading()) return;
    
    // Optimistic UI update
    this.messages.update(m => [...m, { role: 'user', content: text }]);
    this.isLoading.set(true);

    try {
      const historyContents = this.messages().slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      
      const newContents = [...historyContents, { role: 'user', parts: [{ text }] }];

      const response = await this.ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: newContents,
        config: {
          systemInstruction: this.systemInstruction(),
          temperature: 0.8
        }
      });
      
      const reply = response.text || "I'm not sure what to say!";
      this.messages.update(m => [...m, { role: 'model', content: reply }]);
      
      // Fire background worker to analyze/update profile
      this.analyzeProfile();

    } catch (err) {
      console.error(err);
      this.messages.update(m => [...m, { role: 'model', content: "Oops! We hit a snag. My brain is a little fuzzy right now." }]);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async analyzeProfile() {
    // Only analyze if there's sufficient interaction
    if (this.messages().length < 2) return;
    
    const currentProfileString = JSON.stringify(this.userProfile() || { 
      communicationStyle: "Unknown", 
      learningStyle: "Unknown", 
      friendshipDynamic: "Just started", 
      graphMemory: { nodes: [], edges: [] }
    });

    const recentHistory = this.messages().slice(-6).map(m => m.role + ": " + m.content).join('\n');

    const prompt = `
      You are an underlying background personality-learning algorithm updating a Graph-Based Memory System. 
      Analyze the recent chat history and update the user's profile and graph memory.
      Current Profile: ${currentProfileString}
      
      Recent conversation history:
      ${recentHistory}
      
      Provide a completely updated profile in JSON, including the graphMemory (nodes and edges). Synthesize everything into the most accurate description possible, keeping your best friend persona in mind.
      Link concepts they understand to new topics to better match their knowledge level.
    `;

    try {
      const resp = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              communicationStyle: { type: Type.STRING, description: "How the user likes to communicate" },
              learningStyle: { type: Type.STRING, description: "How the user learns best" },
              friendshipDynamic: { type: Type.STRING, description: "The dynamic between the user and Claude" },
              graphMemory: {
                type: Type.OBJECT,
                properties: {
                  nodes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING, description: "snake_case unique id" },
                        name: { type: Type.STRING },
                        type: { type: Type.STRING },
                        understandingLevel: { type: Type.STRING, description: "beginner, intermediate, advanced, expert" },
                        context: { type: Type.STRING }
                      },
                      required: ["id", "name", "type", "understandingLevel", "context"]
                    }
                  },
                  edges: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        sourceId: { type: Type.STRING },
                        targetId: { type: Type.STRING },
                        relationship: { type: Type.STRING }
                      },
                      required: ["sourceId", "targetId", "relationship"]
                    }
                  }
                },
                required: ["nodes", "edges"]
              }
            },
            required: ["communicationStyle", "learningStyle", "friendshipDynamic", "graphMemory"]
          }
        }
      });
      
      if (resp.text) {
        const newProfile = JSON.parse(resp.text) as UserProfile;
        this.saveProfile(newProfile);
      }
    } catch (err) {
      console.warn("Background profile analysis failed.", err);
    }
  }
}
